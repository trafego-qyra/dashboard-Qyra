import "server-only";

import type { ClarityEstado, ClarityResumo } from "@/lib/types";
import { mockClarity } from "@/mocks/reports";
import { getCredentials, getEnv, isForceMock } from "@/server/env";
import { descreverFalha, httpJson } from "@/server/lib/http";

/**
 * Microsoft Clarity via API de exportação (`project-live-insights`).
 * Docs: https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-data-export
 *
 * O Clarity responde o que o GA4 não responde: até onde a pessoa rolou, onde
 * ela clicou no que não era clicável, onde ela se irritou. O GA4 diz que
 * alguém ficou 4 segundos na página; o Clarity diz que parou na primeira
 * dobra.
 *
 * Duas restrições da API moldam tudo aqui:
 *
 * 1. **A janela é curta** — no máximo os últimos 3 dias. Não existe série
 *    histórica, então esta tela é uma fotografia recente, não uma evolução.
 * 2. **A cota é de dez requisições por projeto por dia** — por dia, não por
 *    hora. O conector gasta duas por atualização, então o cache precisa valer
 *    horas, não minutos: em trinta minutos a cota acabava antes do almoço e a
 *    tela passava o resto do dia em 429.
 *
 * O mapa de calor em si não sai por API: o Clarity não expõe a imagem. O que
 * dá para trazer é o número por trás dele — profundidade de rolagem por
 * página — e o link para ver o mapa lá.
 */

/** Máximo que a API aceita. Pedir mais devolve erro, não recorte. */
const MAX_DIAS = 3;

/** Validade do cache. A conta está em `TTL_CLARITY_SEGUNDOS`, em reports.ts. */
const SEIS_HORAS = 6 * 60 * 60;

/**
 * A última leitura que deu certo.
 *
 * Rede de segurança para o dia em que a cota acabar mesmo assim — um deploy a
 * mais, uma instância nova na hora errada. Dado de ontem, rotulado como de
 * ontem, vale mais que uma tela de erro: quem abre o painel quer ver o
 * comportamento do site, e cota estourada é problema do painel, não da
 * pergunta.
 *
 * Vive na memória da instância, então não sobrevive a uma partida a frio. É o
 * que dá para ter sem banco, e cobre o caso comum: a instância que já serviu a
 * tela hoje continua servindo.
 */
let ultimoBom: { resumo: ClarityResumo; em: string } | null = null;

/** Uma linha da resposta: a dimensão pedida mais os valores da métrica. */
interface ClarityLinha {
  /** Valor da dimensão — a URL da página, quando `dimension1=URL`. */
  [chave: string]: string | number | undefined;
}

interface ClarityMetrica {
  metricName: string;
  information: ClarityLinha[];
}

function num(valor: unknown): number {
  const n = Number(valor ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Chama a API uma vez por métrica.
 *
 * A API aceita uma métrica por requisição e devolve tudo num array quando
 * `metricName` é omitido — é essa forma que usamos, porque a cota diária não
 * comporta uma chamada por métrica.
 */
async function buscarInsights(dias: number, dimensao?: string): Promise<ClarityMetrica[]> {
  const env = getEnv();
  const url = new URL("https://www.clarity.ms/export-data/api/v1/project-live-insights");
  url.searchParams.set("numOfDays", String(Math.min(dias, MAX_DIAS)));
  if (dimensao) url.searchParams.set("dimension1", dimensao);

  return httpJson<ClarityMetrica[]>(url.toString(), {
    headers: { authorization: `Bearer ${env.CLARITY_API_TOKEN as string}` },
    // A cota é diária: repetir uma chamada que falhou queima o que resta.
    retries: 0,
    timeoutMs: 20_000,
    // Cache compartilhado entre instâncias, e é ele que segura a cota.
    //
    // O cache em memória do painel é por instância, e a Vercel sobe várias:
    // cada partida a frio recomeça com o cache vazio. Só o Data Cache do Next
    // vale para todas.
    //
    // Seis horas, pela mesma aritmética de `TTL_CLARITY_SEGUNDOS`: dez chamadas
    // por dia, duas por atualização, quatro atualizações e duas de folga.
    revalidateSeconds: SEIS_HORAS,
  });
}

/** Localiza uma métrica pelo nome, tolerando variação de caixa. */
function metrica(dados: ClarityMetrica[], nome: string): ClarityLinha[] {
  const achada = dados.find((m) => m.metricName?.toLowerCase() === nome.toLowerCase());
  return achada?.information ?? [];
}

/** Soma um campo ao longo das linhas de uma métrica. */
function somar(linhas: ClarityLinha[], campo: string): number {
  return linhas.reduce((total, linha) => total + num(linha[campo]), 0);
}

/**
 * Fotografia recente do comportamento no site.
 *
 * **Distingue "não configurado" de "falhou".** Antes os dois voltavam `null`, e
 * a tela imprimia "Clarity não configurado" mesmo com o token cadastrado — o
 * caso mais provável aqui, porque a cota da API é de poucas chamadas por dia e
 * estourar a cota é uma falha como qualquer outra.
 */
export async function fetchClarityResumo(): Promise<ClarityEstado> {
  const env = getEnv();
  // Em demonstração a seção aparece com números fictícios, como o resto da
  // tela — sumir dela deixaria a demonstração incompleta.
  if (isForceMock()) {
    return { estado: "ok", resumo: mockClarity(), atualizadoEm: new Date().toISOString() };
  }
  if (!getCredentials().clarity) return { estado: "sem-credencial" };

  try {
    const [geral, porUrl] = await Promise.all([
      buscarInsights(MAX_DIAS),
      buscarInsights(MAX_DIAS, "URL"),
    ]);

    const trafego = metrica(geral, "Traffic");
    const rolagem = metrica(geral, "ScrollDepth");

    const rolagemPorPagina = metrica(porUrl, "ScrollDepth");
    const trafegoPorPagina = metrica(porUrl, "Traffic");
    const visitasPorPagina = new Map(
      trafegoPorPagina.map((linha) => [String(linha.URL ?? ""), num(linha.totalSessionCount)]),
    );

    /** Índice de uma métrica de atrito por URL, montado sob demanda. */
    const atritoPorPagina = (nome: string) =>
      new Map(metrica(porUrl, nome).map((l) => [String(l.URL ?? ""), num(l.subTotal)]));

    const resumo = {
      // A API devolve a profundidade em porcentagem (0-100); a tela trabalha
      // em fração, como todo percentual do painel.
      rolagemMedia: rolagem.length === 0 ? 0 : num(rolagem[0]?.averageScrollDepth) / 100,
      sessoes: somar(trafego, "totalSessionCount"),
      cliquesMortos: somar(metrica(geral, "DeadClickCount"), "subTotal"),
      cliquesDeRaiva: somar(metrica(geral, "RageClickCount"), "subTotal"),
      voltasRapidas: somar(metrica(geral, "QuickbackClick"), "subTotal"),
      errosDeScript: somar(metrica(geral, "ScriptErrorCount"), "subTotal"),
      porPagina: rolagemPorPagina
        .map((linha) => {
          const pagina = String(linha.URL ?? "—");
          return {
            pagina,
            rolagem: num(linha.averageScrollDepth) / 100,
            sessoes: visitasPorPagina.get(pagina) ?? 0,
            // A resposta por URL já traz todas as métricas — pedir só rolagem e
            // descartar o resto gastaria a mesma cota por menos informação.
            cliquesMortos: atritoPorPagina("DeadClickCount").get(pagina) ?? 0,
            cliquesDeRaiva: atritoPorPagina("RageClickCount").get(pagina) ?? 0,
          };
        })
        .sort((a, b) => Number(b.sessoes) - Number(a.sessoes)),
      dias: MAX_DIAS,
      projeto: env.CLARITY_PROJECT_ID ?? null,
    };

    const em = new Date().toISOString();
    ultimoBom = { resumo, em };
    return { estado: "ok", resumo, atualizadoEm: em };
  } catch (erro) {
    // Cota estourada, token inválido ou instabilidade.
    //
    // Havendo leitura anterior, ela é servida com o carimbo de quando foi feita
    // — a tela mostra o dado e diz que está velho. Sem ela, a tela diz o que
    // aconteceu, em vez de mandar configurar o que já está configurado.
    if (ultimoBom) {
      return {
        estado: "ok",
        resumo: ultimoBom.resumo,
        atualizadoEm: ultimoBom.em,
        defasado: true,
      };
    }
    return { estado: "falhou", motivo: descreverFalha(erro) };
  }
}
