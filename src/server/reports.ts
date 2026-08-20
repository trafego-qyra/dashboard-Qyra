import { avisoOperacao } from "@/lib/avisos";
import "server-only";

import { CHANNELS, getChannel } from "@/lib/channels";
import { previousRange } from "@/lib/date-range";
import type {
  ChannelId,
  ChannelReport,
  DateRange,
  Kpi,
  Notice,
  OverviewReport,
  SeriesPoint,
} from "@/lib/types";
import { cached } from "@/server/lib/cache";
import { fetchGa4Report } from "./connectors/ga4";
import { fetchGoogleAdsReport } from "./connectors/google-ads";
import { fetchMetaAdsReport } from "./connectors/meta-ads";
import { fetchOrganicoReport } from "./connectors/organico";

/**
 * Ponto único de acesso a dados de canal. As telas chamam daqui — nunca um
 * conector direto — para que cache, comparação de período e degradação de
 * erro sejam idênticos em toda a aplicação.
 */

const FETCHERS: Record<ChannelId, (range: DateRange) => Promise<ChannelReport>> = {
  "meta-ads": fetchMetaAdsReport,
  "google-ads": fetchGoogleAdsReport,
  ga4: fetchGa4Report,
  organico: fetchOrganicoReport,
};

function cacheKey(channel: ChannelId, range: DateRange): string {
  return `${channel}:${range.from}:${range.to}`;
}

/** Total de uma métrica na série — base da comparação com o período anterior. */
function total(series: SeriesPoint[], key: string): number {
  return series.reduce((acc, point) => acc + (Number(point[key]) || 0), 0);
}

/**
 * Preenche `previousValue` dos KPIs a partir do relatório da janela anterior.
 *
 * Usa o KPI homônimo do relatório anterior, **nunca a soma da série**. A versão
 * anterior somava os valores diários da métrica, o que só faz sentido para
 * grandezas aditivas: somar sete CTRs diários dá sete vezes um CTR, e a
 * comparação exibia quedas de 95% que nunca aconteceram. O conector já calcula
 * cada KPI corretamente para o seu período — inclusive razões e médias — então
 * é dele que o valor anterior tem de vir.
 */
function attachComparison(report: ChannelReport, previous: ChannelReport): Kpi[] {
  const anteriores = new Map(previous.kpis.map((kpi) => [kpi.key, kpi.value]));

  return report.kpis.map((kpi) => {
    if (kpi.previousValue !== undefined) return kpi;

    const anterior = anteriores.get(kpi.key);
    // KPI sem correspondente fica sem comparação, em vez de comparar contra
    // número inventado.
    return anterior === undefined ? kpi : { ...kpi, previousValue: anterior };
  });
}

export async function getChannelReport(
  channel: ChannelId,
  range: DateRange,
  options: { compare?: boolean } = {},
): Promise<ChannelReport> {
  const { compare = true } = options;

  const report = await cached(cacheKey(channel, range), () => FETCHERS[channel](range));
  if (!compare) return report;

  // Relatório de período fixo não tem janela anterior: comparar o export com
  // ele mesmo devolve 0% e a tela exibe "estável", que sugere uma medição de
  // estabilidade que não existe. Sem comparação, o indicador diz "sem base" —
  // que é a verdade.
  if (report.source === "snapshot") return report;

  try {
    const prevRange = previousRange(range);
    const previous = await cached(cacheKey(channel, prevRange), () => FETCHERS[channel](prevRange));
    return { ...report, kpis: attachComparison(report, previous) };
  } catch {
    // Comparação é um enfeite útil, não requisito: sem ela a tela ainda serve.
    return report;
  }
}

export interface ChannelResult {
  channel: ChannelId;
  report: ChannelReport | null;
  error: string | null;
}

/** Busca todos os canais em paralelo; a falha de um não derruba os outros. */
export async function getAllReports(range: DateRange): Promise<ChannelResult[]> {
  return Promise.all(
    CHANNELS.map(async ({ id }): Promise<ChannelResult> => {
      try {
        return { channel: id, report: await getChannelReport(id, range), error: null };
      } catch (error) {
        return {
          channel: id,
          report: null,
          error: error instanceof Error ? error.message : "Falha desconhecida",
        };
      }
    }),
  );
}

/** Soma a primeira métrica existente entre as candidatas. */
function pickTotal(report: ChannelReport, keys: string[]): number {
  for (const key of keys) {
    if (report.series.some((p) => key in p)) return total(report.series, key);
  }
  return 0;
}

/** Totais consolidados de um intervalo — base tanto do período atual quanto do anterior. */
async function collectTotals(range: DateRange) {
  const results = await getAllReports(range);

  const byChannel = results
    .filter((r): r is ChannelResult & { report: ChannelReport } => r.report !== null)
    .map((r) => ({
      channel: r.channel,
      label:
        r.report.source === "snapshot"
          ? `${getChannel(r.channel).label} · período fixo`
          : getChannel(r.channel).label,
      slot: getChannel(r.channel).slot,
      source: r.report.source,
      investment: pickTotal(r.report, ["spend", "cost"]),
      conversions: pickTotal(r.report, ["leads", "conversions", "engagement"]),
      // Sem `clicks` no fallback: clique não é alcance nem sessão, e sob um
      // rótulo comum o número engana. Canal sem a métrica mostra "—".
      sessions: pickTotal(r.report, ["sessions", "reach"]),
    }));

  const ga4 = results.find((r) => r.channel === "ga4")?.report ?? null;

  return {
    results,
    byChannel,
    investment: byChannel.reduce((a, c) => a + c.investment, 0),
    paidConversions: byChannel
      .filter((c) => c.channel === "meta-ads" || c.channel === "google-ads")
      .reduce((a, c) => a + c.conversions, 0),
    sessions: ga4 ? pickTotal(ga4, ["sessions"]) : 0,
    siteConversions: ga4 ? pickTotal(ga4, ["conversions"]) : 0,
  };
}

/** Dedup por texto: `Set` de objeto não deduplica nada, cada aviso é uma referência nova. */
function deduplicar(notices: Notice[]): Notice[] {
  const vistos = new Set<string>();
  return notices.filter((n) => !vistos.has(n.text) && vistos.add(n.text));
}

export async function getOverviewReport(range: DateRange): Promise<OverviewReport> {
  const results = await getAllReports(range);
  const notices: Notice[] = [];

  for (const result of results) {
    // Mensagem de erro do canal é operação: o cliente vê o canal ausente do
    // consolidado, não o texto que a API devolveu.
    if (result.error)
      notices.push(avisoOperacao(`${getChannel(result.channel).label}: ${result.error}`));
    else if (result.report) notices.push(...result.report.notices);
  }

  const byChannel = results
    .filter((r): r is ChannelResult & { report: ChannelReport } => r.report !== null)
    .map((r) => ({
      channel: r.channel,
      label:
        r.report.source === "snapshot"
          ? `${getChannel(r.channel).label} · período fixo`
          : getChannel(r.channel).label,
      slot: getChannel(r.channel).slot,
      source: r.report.source,
      investment: pickTotal(r.report, ["spend", "cost"]),
      conversions: pickTotal(r.report, ["leads", "conversions", "engagement"]),
      // Sem `clicks` no fallback: clique não é alcance nem sessão, e sob um
      // rótulo comum o número engana. Canal sem a métrica mostra "—".
      sessions: pickTotal(r.report, ["sessions", "reach"]),
    }));

  // Canal em período fixo não entra no consolidado: somar 14 dias de um export
  // com 28 dias de outro canal produz um total que não corresponde a intervalo
  // nenhum. Ele continua visível em `byChannel`, com a origem declarada.
  const noPeriodo = byChannel.filter((c) => c.source !== "snapshot");

  const investment = noPeriodo.reduce((a, c) => a + c.investment, 0);
  const paidConversions = noPeriodo
    .filter((c) => c.channel === "meta-ads" || c.channel === "google-ads")
    .reduce((a, c) => a + c.conversions, 0);

  const ga4 = results.find((r) => r.channel === "ga4")?.report ?? null;
  const sessions = ga4 ? pickTotal(ga4, ["sessions"]) : 0;
  const siteConversions = ga4 ? pickTotal(ga4, ["conversions"]) : 0;

  // Comparação com a janela anterior. Se falhar, a tela segue sem o delta —
  // "vs. período anterior" é contexto, não o dado principal.
  let previous: Awaited<ReturnType<typeof collectTotals>> | null = null;
  try {
    previous = await collectTotals(previousRange(range));
  } catch {
    previous = null;
  }

  const prevCpa =
    previous && previous.paidConversions > 0
      ? previous.investment / previous.paidConversions
      : undefined;
  const prevSiteRate =
    previous && previous.sessions > 0 ? previous.siteConversions / previous.sessions : undefined;

  // Série consolidada. As conversões vêm **apenas dos canais pagos**, o mesmo
  // recorte do KPI "Conversões pagas". Somar as conversões do GA4 aqui contaria
  // em dobro: uma submissão de formulário aparece no GA4 e também é atribuída
  // pela plataforma que trouxe a visita — o gráfico ficaria acima do indicador
  // logo ao lado, e quem confere os dois encontraria contradição.
  const dateIndex = new Map<string, SeriesPoint>();
  for (const result of results) {
    if (!result.report) continue;

    // Período fixo fica fora da série pelo mesmo motivo do KPI.
    if (result.report.source === "snapshot") continue;

    const ehPago = result.channel === "meta-ads" || result.channel === "google-ads";

    for (const point of result.report.series) {
      const existing = dateIndex.get(point.date) ?? {
        date: point.date,
        investment: 0,
        sessions: 0,
        conversions: 0,
      };
      existing.investment =
        Number(existing.investment) + (Number(point.spend) || Number(point.cost) || 0);
      existing.sessions = Number(existing.sessions) + (Number(point.sessions) || 0);
      if (ehPago) {
        existing.conversions =
          Number(existing.conversions) +
          (Number(point.leads) || 0) +
          (Number(point.conversions) || 0);
      }
      dateIndex.set(point.date, existing);
    }
  }

  const series = [...dateIndex.values()].sort((a, b) => a.date.localeCompare(b.date));

  // Origem conservadora: basta um canal em demonstração para o consolidado
  // deixar de ser dado real. O critério anterior — "algum canal ao vivo" —
  // escondia o aviso justamente na configuração mais comum, a de quem acabou de
  // conectar o primeiro canal, e somava investimento fictício ao total.
  const todosAoVivo = byChannel.length > 0 && byChannel.every((canal) => canal.source === "live");
  const failedChannels = results.filter((r) => r.report === null).map((r) => r.channel);

  return {
    range,
    source: todosAoVivo ? "live" : "mock",
    fetchedAt: new Date().toISOString(),
    kpis: [
      {
        key: "investment",
        label: "Investimento total",
        value: investment,
        previousValue: previous?.investment,
        format: "currency",
      },
      {
        key: "conversions",
        label: "Conversões pagas",
        value: paidConversions,
        previousValue: previous?.paidConversions,
        format: "integer",
      },
      {
        key: "cpa",
        label: "Custo por conversão",
        value: paidConversions === 0 ? 0 : investment / paidConversions,
        previousValue: prevCpa,
        format: "currency",
        lowerIsBetter: true,
        hint: "Investimento em mídia dividido pelas conversões de Meta Ads e Google Ads.",
      },
      {
        key: "sessions",
        label: "Sessões no site",
        value: sessions,
        previousValue: previous?.sessions,
        format: "integer",
      },
      {
        key: "siteConversionRate",
        label: "Conversão do site",
        value: sessions === 0 ? 0 : siteConversions / sessions,
        previousValue: prevSiteRate,
        format: "percent",
      },
    ],
    series,
    seriesDefs: [
      { key: "investment", label: "Investimento", format: "currency", slot: 1 },
      { key: "conversions", label: "Conversões", format: "integer", slot: 2 },
    ],
    byChannel,
    failedChannels,
    notices: deduplicar(notices),
  };
}
