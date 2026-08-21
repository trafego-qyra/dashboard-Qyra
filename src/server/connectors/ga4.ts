import { avisoOperacao } from "@/lib/avisos";
import "server-only";

import { eachDay } from "@/lib/date-range";
import type { ChannelReport, DateRange, SeriesPoint } from "@/lib/types";
import { mockGa4 } from "@/mocks/reports";
import { getCredentials, getEnv, isForceMock } from "@/server/env";
import { getGoogleAccessToken } from "@/server/lib/google-auth";
import { httpJson } from "@/server/lib/http";

/**
 * GA4 via Data API v1beta (`runReport`).
 * Docs: https://developers.google.com/analytics/devguides/reporting/data/v1
 */

interface RunReportResponse {
  rows?: Array<{
    dimensionValues?: Array<{ value?: string }>;
    metricValues?: Array<{ value?: string }>;
  }>;
}

function num(value: string | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * O GA4 devolve marcadores próprios para tráfego sem UTM. Traduzir aqui evita
 * que "(not set)" apareça na tela do cliente parecendo defeito.
 */
const ROTULO_DE_ORIGEM: Record<string, string> = {
  "(not set)": "não informado",
  "(direct)": "direto",
  "(none)": "sem mídia",
  "(organic)": "orgânico",
};

function rotularOrigem(valor: string | undefined): string {
  const bruto = valor?.trim();
  if (!bruto) return "não informado";
  return ROTULO_DE_ORIGEM[bruto] ?? bruto;
}

async function runReport(body: unknown): Promise<RunReportResponse> {
  const env = getEnv();
  const token = await getGoogleAccessToken();
  return httpJson<RunReportResponse>(
    `https://analyticsdata.googleapis.com/v1beta/properties/${env.GA4_PROPERTY_ID}:runReport`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

/** GA4 devolve datas como `YYYYMMDD`. */
function toIso(compact: string): string {
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}

export async function fetchGa4Report(range: DateRange): Promise<ChannelReport> {
  const forceMock = isForceMock();

  if (forceMock || !getCredentials().ga4) {
    const report = mockGa4(range, new Date().toISOString());
    report.notices = [
      avisoOperacao(
        forceMock
          ? "Modo mock forçado por QYRA_FORCE_MOCK."
          : "Sem credencial do Google Analytics — exibindo dados de demonstração.",
      ),
    ];
    return report;
  }

  const dateRanges = [{ startDate: range.from, endDate: range.to }];

  const [daily, byChannel, byPage, byUtm] = await Promise.all([
    runReport({
      dateRanges,
      dimensions: [{ name: "date" }],
      metrics: [
        { name: "sessions" },
        { name: "totalUsers" },
        { name: "conversions" },
        { name: "engagementRate" },
        { name: "averageSessionDuration" },
      ],
      orderBys: [{ dimension: { dimensionName: "date" } }],
      limit: 400,
    }),
    runReport({
      dateRanges,
      dimensions: [{ name: "sessionDefaultChannelGroup" }],
      metrics: [{ name: "sessions" }, { name: "conversions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 15,
    }),
    runReport({
      dateRanges,
      // `pagePath` sozinho devolve "/plano", "/", "/blog/artigo-3" — endereço,
      // não nome. O título é o que a pessoa lendo o relatório reconhece.
      dimensions: [{ name: "pageTitle" }, { name: "pagePath" }],
      // `averageSessionDuration` é métrica de sessão: cruzada com página, ela
      // devolve a duração das sessões que passaram por ali, não o tempo gasto
      // naquela página. Era por isso que o número não fechava com o indicador
      // do topo. `userEngagementDuration` dividido por visualizações é o tempo
      // de engajamento por visualização, que é o que a coluna promete.
      metrics: [{ name: "screenPageViews" }, { name: "userEngagementDuration" }],
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit: 15,
    }),
    // O agrupamento padrão do GA4 joga todo link de rede social no mesmo balde.
    // Para saber qual post trouxe visita é preciso a origem crua: é o que a
    // UTM carrega, e é o único jeito de separar Instagram de LinkedIn, e um
    // post do outro dentro da mesma rede.
    runReport({
      dateRanges,
      dimensions: [
        { name: "sessionSource" },
        { name: "sessionMedium" },
        { name: "sessionCampaignName" },
        // `utm_content` no padrão da Qyra identifica o post ou o criativo, e
        // `utm_campaign` é o tema do mês. Sem esta dimensão, todos os posts de
        // agosto colapsam numa linha "institucional_ago" só — justamente a
        // granularidade que interessa para saber qual post trouxe gente.
        { name: "sessionManualAdContent" },
      ],
      metrics: [{ name: "sessions" }, { name: "conversions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 40,
    }),
  ]);

  const byDate = new Map(
    (daily.rows ?? []).map((row) => [
      toIso(row.dimensionValues?.[0]?.value ?? ""),
      {
        sessions: num(row.metricValues?.[0]?.value),
        users: num(row.metricValues?.[1]?.value),
        conversions: num(row.metricValues?.[2]?.value),
        engagementRate: num(row.metricValues?.[3]?.value),
        avgDuration: num(row.metricValues?.[4]?.value),
      },
    ]),
  );

  const series: SeriesPoint[] = eachDay(range).map((date) => ({
    date,
    sessions: 0,
    users: 0,
    conversions: 0,
    engagementRate: 0,
    avgDuration: 0,
    ...byDate.get(date),
  }));

  const totals = series.reduce(
    (acc, p) => ({
      sessions: acc.sessions + Number(p.sessions),
      users: acc.users + Number(p.users),
      conversions: acc.conversions + Number(p.conversions),
      // Duração é média por sessão, e média não se soma. Reconstruindo o tempo
      // total do dia (média x sessões) a soma volta a ser exata: um dia com 2
      // sessões deixa de pesar igual a um dia com 200.
      duration: acc.duration + Number(p.avgDuration) * Number(p.sessions),
    }),
    { sessions: 0, users: 0, conversions: 0, duration: 0 },
  );

  return {
    channel: "ga4",
    label: "Google Analytics",
    source: "live",
    range,
    fetchedAt: new Date().toISOString(),
    kpis: [
      { key: "sessions", label: "Sessões", value: totals.sessions, format: "integer" },
      { key: "users", label: "Usuários", value: totals.users, format: "integer" },
      { key: "conversions", label: "Conversões", value: totals.conversions, format: "integer" },
      {
        key: "conversionRate",
        label: "Taxa de conversão",
        value: totals.sessions === 0 ? 0 : totals.conversions / totals.sessions,
        format: "percent",
      },
      {
        key: "avgDuration",
        label: "Duração média",
        value: totals.sessions === 0 ? 0 : totals.duration / totals.sessions,
        format: "duration",
        hint: "Tempo médio por sessão no período, ponderado pelo volume de cada dia — não é a média das médias diárias.",
      },
    ],
    series,
    seriesDefs: [
      { key: "sessions", label: "Sessões", format: "integer", slot: 1 },
      { key: "conversions", label: "Conversões", format: "integer", slot: 2 },
    ],
    tables: [
      {
        title: "Canais de aquisição",
        description: "Agrupamento padrão do GA4.",
        columns: [
          { key: "channel", label: "Canal", align: "left" },
          { key: "sessions", label: "Sessões", format: "integer", align: "right" },
          { key: "conversions", label: "Conversões", format: "integer", align: "right" },
          { key: "rate", label: "Taxa de conversão", format: "percent", align: "right" },
        ],
        rows: (byChannel.rows ?? []).map((row) => {
          const sessions = num(row.metricValues?.[0]?.value);
          const conversions = num(row.metricValues?.[1]?.value);
          return {
            channel: row.dimensionValues?.[0]?.value ?? "—",
            sessions,
            conversions,
            rate: sessions === 0 ? 0 : conversions / sessions,
          };
        }),
      },
      {
        title: "Origem das visitas",
        description:
          "De onde a sessão veio, pela UTM do link. `utm_campaign` é o tema, `utm_content` é o post — é a segunda que separa um post do outro dentro do mesmo mês.",
        columns: [
          { key: "origem", label: "Origem / mídia", align: "left" },
          { key: "campanha", label: "Campanha", align: "left" },
          { key: "conteudo", label: "Post / criativo", align: "left" },
          { key: "sessions", label: "Sessões", format: "integer", align: "right" },
          { key: "conversions", label: "Conversões", format: "integer", align: "right" },
          { key: "rate", label: "Taxa de conversão", format: "percent", align: "right" },
        ],
        rows: (byUtm.rows ?? []).map((row) => {
          const sessions = num(row.metricValues?.[0]?.value);
          const conversions = num(row.metricValues?.[1]?.value);
          const origem = rotularOrigem(row.dimensionValues?.[0]?.value);
          const midia = rotularOrigem(row.dimensionValues?.[1]?.value);
          return {
            origem: `${origem} / ${midia}`,
            campanha: rotularOrigem(row.dimensionValues?.[2]?.value),
            conteudo: rotularOrigem(row.dimensionValues?.[3]?.value),
            sessions,
            conversions,
            rate: sessions === 0 ? 0 : conversions / sessions,
          };
        }),
      },
      {
        title: "Páginas mais vistas",
        description:
          "Tempo é de engajamento por visualização — quanto a pessoa passou naquela página, não quanto durou a sessão inteira dela.",
        // O GA4 responde quanto tempo a pessoa ficou; o Clarity responde até
        // onde ela leu. Uma pergunta puxa a outra, e o atalho evita procurar o
        // projeto do zero. Aponta para a seção de mapas de calor, onde a página
        // é escolhida — não para a página específica, porque o formato do
        // filtro na URL do Clarity não foi verificado contra a ferramenta.
        ...(getEnv().CLARITY_PROJECT_ID
          ? {
              action: {
                label: "Mapas de calor no Clarity",
                href: `https://clarity.microsoft.com/projects/view/${getEnv().CLARITY_PROJECT_ID}/heatmaps`,
              },
            }
          : {}),
        columns: [
          { key: "page", label: "Página", align: "left" },
          { key: "path", label: "Endereço", align: "left" },
          { key: "views", label: "Visualizações", format: "integer", align: "right" },
          { key: "avgDuration", label: "Tempo médio", format: "duration", align: "right" },
        ],
        rows: (byPage.rows ?? []).map((row) => {
          const views = num(row.metricValues?.[0]?.value);
          const engajamento = num(row.metricValues?.[1]?.value);
          const titulo = row.dimensionValues?.[0]?.value?.trim();
          const caminho = row.dimensionValues?.[1]?.value ?? "—";
          return {
            // Página sem título cai no endereço: melhor um "/plano" do que um
            // travessão que não diz nada.
            page: titulo || caminho,
            path: caminho,
            views,
            avgDuration: views === 0 ? 0 : engajamento / views,
          };
        }),
      },
    ],
    notices: [],
  };
}
