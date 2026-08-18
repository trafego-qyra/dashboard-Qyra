import "server-only";

import { eachDay } from "@/lib/date-range";
import type { ChannelReport, DateRange, SeriesPoint } from "@/lib/types";
import { mockGa4 } from "@/mocks/reports";
import { credentials, env, forceMock } from "@/server/env";
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

async function runReport(body: unknown): Promise<RunReportResponse> {
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
  if (forceMock || !credentials.ga4) {
    const report = mockGa4(range, new Date().toISOString());
    report.notices = [
      forceMock
        ? "Modo mock forçado por QYRA_FORCE_MOCK."
        : "Sem credencial do Google Analytics — exibindo dados de demonstração.",
    ];
    return report;
  }

  const dateRanges = [{ startDate: range.from, endDate: range.to }];

  const [daily, byChannel, byPage] = await Promise.all([
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
      dimensions: [{ name: "pagePath" }],
      metrics: [{ name: "screenPageViews" }, { name: "averageSessionDuration" }],
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit: 15,
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
      duration: acc.duration + Number(p.avgDuration),
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
        value: series.length === 0 ? 0 : totals.duration / series.length,
        format: "duration",
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
        title: "Páginas mais vistas",
        columns: [
          { key: "page", label: "Página", align: "left" },
          { key: "views", label: "Visualizações", format: "integer", align: "right" },
          { key: "avgDuration", label: "Tempo médio", format: "duration", align: "right" },
        ],
        rows: (byPage.rows ?? []).map((row) => ({
          page: row.dimensionValues?.[0]?.value ?? "—",
          views: num(row.metricValues?.[0]?.value),
          avgDuration: num(row.metricValues?.[1]?.value),
        })),
      },
    ],
    notices: [],
  };
}
