import "server-only";

import { rangeFromPreset } from "@/lib/date-range";
import type { DateRange, FunnelBlock } from "@/lib/types";
import { getCredentials } from "@/server/env";
import { excluir, inserir, selecionar } from "@/server/lib/supabase";

/**
 * O funil do questionário das LPs de planos (planos.qyra.com.br).
 *
 * A LP manda uma linha por tela vista; aqui ela é conferida, guardada e somada.
 * O Analytics já diz quantos chegaram e o Kommo quantos viraram negócio — o que
 * faltava era o meio: em qual pergunta as pessoas desistem.
 *
 * O que atravessa é uma sessão sorteada no navegador, a etapa, a LP e as UTMs.
 * Nada de nome, contato, CEP ou resposta: ninguém que leia a tabela descobre
 * quem é a pessoa nem o que ela respondeu.
 */

const TABELA = "funil_lp";
const RESUMO = "funil_lp_por_dia";

/** Mesmo prazo da ponte de captura: passado isso, a linha não serve a nada. */
const DIAS_ATE_O_EXPURGO = 90;

/**
 * As etapas do funil, na ordem em que a pessoa passa por elas.
 *
 * Ficam de fora as telas que nem todo mundo vê — a abertura e a pergunta de
 * prontidão somem quando a pessoa começa pelo cartão do topo da LP, e as
 * perguntas de saúde só existem para Essencial e Avançado. Elas são aceitas e
 * guardadas, mas não entram na figura: um degrau que só parte das pessoas pisa
 * desenharia um gargalo que não existe.
 */
const FUNIL = [
  ["visita", "Visitou a LP"],
  ["inicio", "Abriu o questionário"],
  ["objetivo", "Objetivo"],
  ["corpo", "Altura e peso"],
  ["meta", "Meta de peso"],
  ["urgencia", "Urgência"],
  ["suporte", "Suporte desejado"],
  ["historico", "Histórico de GLP-1"],
  ["habitos", "Hábitos"],
  ["investimento", "Investimento"],
  ["cep", "CEP"],
  ["contato", "Viu a tela de contato"],
  ["lead", "Deixou o contato"],
  ["perfil", "Viu o perfil de saúde"],
  ["plano", "Viu o plano"],
  ["quero_plano", 'Clicou em "Quero o plano"'],
  ["concluiu", "Concluiu"],
] as const;

/** Saídas antes do fim: quem o próprio questionário encerra. */
const SAIDAS = ["saida_imc_baixo", "saida_imc_adequado", "saida_reprovado"] as const;

/** Telas guardadas mas fora da figura (ver `FUNIL`). */
const FORA_DA_FIGURA = [
  "intro",
  "prontidao",
  "consent",
  "exclusao",
  "liberado",
  // A contratação na própria LP: dados, cartão e pagamento aprovado.
  "dados",
  "pagamento",
  "pago",
] as const;

const ETAPAS = new Set<string>([...FUNIL.map(([id]) => id), ...SAIDAS, ...FORA_DA_FIGURA]);
const LPS = new Set(["avancado", "essencial", "digital"]);

const FORMATO_DA_SESSAO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAXIMO_DA_UTM = 200;

/** O que o navegador manda, já conferido. */
export interface EtapaDaLp {
  sessao: string;
  etapa: string;
  lp: string;
  plano: string | null;
  clienteId: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
}

function texto(valor: unknown, limite: number, formato?: RegExp): string | null {
  if (typeof valor !== "string") return null;

  const limpo = valor.trim();
  if (limpo === "" || limpo.length > limite) return null;
  if (formato && !formato.test(limpo)) return null;

  return limpo;
}

/**
 * Confere o corpo e devolve `null` se não servir.
 *
 * A rota é pública por necessidade — quem chama é o navegador de um visitante —
 * então o que não for uma etapa conhecida, de uma LP conhecida, com uma sessão
 * em formato de UUID, não vira linha.
 */
export function lerEtapa(bruto: unknown): EtapaDaLp | null {
  if (typeof bruto !== "object" || bruto === null) return null;

  const corpo = bruto as Record<string, unknown>;
  const sessao = texto(corpo.sessao, 64, FORMATO_DA_SESSAO);
  const etapa = texto(corpo.etapa, 40);
  const lp = texto(corpo.lp, 40);
  if (!sessao || !etapa || !ETAPAS.has(etapa) || !lp || !LPS.has(lp)) return null;

  const plano = texto(corpo.plano, 40);
  const clienteId = texto(corpo.cliente_id, 64, FORMATO_DA_SESSAO);

  return {
    sessao: sessao.toLowerCase(),
    etapa,
    lp,
    plano: plano && LPS.has(plano) ? plano : null,
    clienteId: clienteId ? clienteId.toLowerCase() : null,
    utmSource: texto(corpo.utm_source, MAXIMO_DA_UTM),
    utmMedium: texto(corpo.utm_medium, MAXIMO_DA_UTM),
    utmCampaign: texto(corpo.utm_campaign, MAXIMO_DA_UTM),
    utmContent: texto(corpo.utm_content, MAXIMO_DA_UTM),
  };
}

/**
 * Guarda a etapa. A mesma sessão passando de novo pela mesma tela não vira
 * segunda linha: a chave é (sessão, etapa) e o `inserir` ignora a repetida.
 */
export async function registrarEtapa(etapa: EtapaDaLp): Promise<void> {
  if (!getCredentials().banco) return;

  await inserir(TABELA, [
    {
      sessao: etapa.sessao,
      etapa: etapa.etapa,
      lp: etapa.lp,
      plano: etapa.plano,
      cliente_id: etapa.clienteId,
      utm_source: etapa.utmSource,
      utm_medium: etapa.utmMedium,
      utm_campaign: etapa.utmCampaign,
      utm_content: etapa.utmContent,
    },
  ]);
}

interface LinhaDoResumo {
  dia: string;
  lp: string;
  etapa: string;
  sessoes: number;
}

export interface FunilDaLp {
  periodo: DateRange;
  bloco: FunnelBlock;
  /** Quem o questionário encerrou antes do fim, por motivo. */
  saidas: { imcBaixo: number; imcAdequado: number; reprovado: number };
  /** Pagamentos aprovados na própria LP. */
  pagos: number;
}

export type FunilDaLpEstado =
  | { estado: "ok"; funil: FunilDaLp }
  | { estado: "vazio"; periodo: DateRange }
  | { estado: "sem-banco" }
  | { estado: "falhou"; motivo: string };

/**
 * Os últimos 28 dias, **com** o dia de hoje.
 *
 * As outras telas param ontem porque o dia corrente é parcial nas plataformas
 * de anúncio. Aqui o dado é nosso e chega na hora — e, logo depois de ligar o
 * funil, o dia de hoje é justamente o que se quer ver.
 */
function periodo(agora = new Date()): DateRange {
  return rangeFromPreset("28d", new Date(agora.getTime() + 86_400_000));
}

/**
 * Soma o resumo diário num funil.
 *
 * Cada etapa conta quem chegou a ela **ou passou dela**, como diz o
 * `FunnelStage`: quem volta ao questionário em outra aba pula telas já vistas,
 * e sem isso um degrau poderia ter menos gente que o seguinte.
 */
export function montarFunil(linhas: LinhaDoResumo[], intervalo: DateRange): FunilDaLp | null {
  const porEtapa = new Map<string, number>();
  for (const linha of linhas) {
    porEtapa.set(linha.etapa, (porEtapa.get(linha.etapa) ?? 0) + Number(linha.sessoes || 0));
  }

  const valores = FUNIL.map(([id]) => porEtapa.get(id) ?? 0);
  if (valores.every((v) => v === 0)) return null;

  for (let i = valores.length - 2; i >= 0; i -= 1) {
    valores[i] = Math.max(valores[i], valores[i + 1]);
  }

  return {
    periodo: intervalo,
    bloco: {
      title: "Funil do questionário das LPs",
      description: "Pessoas que chegaram a cada tela, nas três LPs de planos",
      stages: FUNIL.map(([, label], i) => ({ label, value: valores[i] })),
      caveat:
        "Conta pessoas por aba do navegador: quem volta outro dia conta de novo. As perguntas de saúde, que só existem para Essencial e Avançado, ficam fora da figura.",
    },
    saidas: {
      imcBaixo: porEtapa.get("saida_imc_baixo") ?? 0,
      imcAdequado: porEtapa.get("saida_imc_adequado") ?? 0,
      reprovado: porEtapa.get("saida_reprovado") ?? 0,
    },
    pagos: porEtapa.get("pago") ?? 0,
  };
}

/** O funil dos últimos 28 dias, para a tela de Comportamento. Nunca lança. */
export async function resumoDoFunil(): Promise<FunilDaLpEstado> {
  if (!getCredentials().banco) return { estado: "sem-banco" };

  const intervalo = periodo();
  try {
    const linhas = await selecionar<LinhaDoResumo>(RESUMO, {
      select: "dia,lp,etapa,sessoes",
      and: `(dia.gte.${intervalo.from},dia.lte.${intervalo.to})`,
    });
    const funil = montarFunil(linhas, intervalo);
    return funil ? { estado: "ok", funil } : { estado: "vazio", periodo: intervalo };
  } catch (erro) {
    return { estado: "falhou", motivo: erro instanceof Error ? erro.message : String(erro) };
  }
}

/** Apaga etapas com mais de noventa dias, pela mesma regra da ponte. */
export async function expurgarFunil(): Promise<void> {
  if (!getCredentials().banco) return;

  const limite = new Date(Date.now() - DIAS_ATE_O_EXPURGO * 24 * 60 * 60 * 1_000);
  await excluir(TABELA, { criado_em: `lt.${limite.toISOString()}` });
}
