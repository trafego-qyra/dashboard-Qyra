import "server-only";

import type { ClarityResumo } from "@/lib/types";
import { mockClarity } from "@/mocks/reports";
import { getCredentials, getEnv, isForceMock } from "@/server/env";
import { httpJson } from "@/server/lib/http";

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
 * 2. **A cota é baixa** — poucas chamadas por dia, não por hora. Uma consulta
 *    por carregamento de página estouraria a cota antes do almoço, então o
 *    resultado é cacheado com folga.
 *
 * O mapa de calor em si não sai por API: o Clarity não expõe a imagem. O que
 * dá para trazer é o número por trás dele — profundidade de rolagem por
 * página — e o link para ver o mapa lá.
 */

/** Máximo que a API aceita. Pedir mais devolve erro, não recorte. */
const MAX_DIAS = 3;

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
 * Devolve `null` quando não há credencial ou a chamada falha: esta seção é
 * complemento, e a tela do Analytics continua inteira sem ela.
 */
export async function fetchClarityResumo(): Promise<ClarityResumo | null> {
  const env = getEnv();
  // Em demonstração a seção aparece com números fictícios, como o resto da
  // tela — sumir dela deixaria a demonstração incompleta.
  if (isForceMock()) return mockClarity();
  if (!getCredentials().clarity) return null;

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

    return {
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
          };
        })
        .sort((a, b) => Number(b.sessoes) - Number(a.sessoes)),
      dias: MAX_DIAS,
      projeto: env.CLARITY_PROJECT_ID ?? null,
    };
  } catch {
    // Cota estourada, token inválido ou instabilidade: a tela do Analytics não
    // pode cair por causa de uma seção complementar.
    return null;
  }
}
