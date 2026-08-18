import "server-only";

import { eachDay } from "@/lib/date-range";
import type { ChannelReport, DateRange, SeriesPoint } from "@/lib/types";
import { mockGoogleAds } from "@/mocks/reports";
import { credentials, env, forceMock } from "@/server/env";
import { getGoogleAccessToken } from "@/server/lib/google-auth";
import { httpJson } from "@/server/lib/http";

/**
 * Google Ads via REST (`searchStream` do GAQL).
 * Docs: https://developers.google.com/google-ads/api/rest/overview
 *
 * Sem o SDK oficial de propósito: ele carrega gRPC + protobuf e pesa mais que
 * todo o resto do bundle de servidor. A superfície que usamos é uma query.
 */

interface GoogleAdsRow {
  segments?: { date?: string };
  campaign?: { name?: string; advertisingChannelType?: string };
  metrics?: {
    costMicros?: string;
    impressions?: string;
    clicks?: string;
    conversions?: number;
  };
}

/** `searchStream` responde um array de blocos, cada um com `results`. */
type SearchStreamResponse = Array<{ results?: GoogleAdsRow[] }>;

const MICROS = 1_000_000;

function num(value: string | number | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function runQuery(query: string): Promise<GoogleAdsRow[]> {
  const token = await getGoogleAccessToken();
  const customerId = (env.GOOGLE_ADS_CUSTOMER_ID as string).replace(/-/g, "");

  const headers: Record<string, string> = {
    authorization: `Bearer ${token}`,
    "developer-token": env.GOOGLE_ADS_DEVELOPER_TOKEN as string,
    "content-type": "application/json",
  };
  if (env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) {
    headers["login-customer-id"] = env.GOOGLE_ADS_LOGIN_CUSTOMER_ID.replace(/-/g, "");
  }

  const response = await httpJson<SearchStreamResponse>(
    `https://googleads.googleapis.com/${env.GOOGLE_ADS_API_VERSION}/customers/${customerId}/googleAds:searchStream`,
    { method: "POST", headers, body: JSON.stringify({ query }) },
  );

  return response.flatMap((chunk) => chunk.results ?? []);
}

export async function fetchGoogleAdsReport(range: DateRange): Promise<ChannelReport> {
  if (forceMock || !credentials.googleAds) {
    const report = mockGoogleAds(range, new Date().toISOString());
    report.notices = [
      forceMock
        ? "Modo mock forçado por QYRA_FORCE_MOCK."
        : "Sem credencial do Google Ads — exibindo dados de demonstração.",
    ];
    return report;
  }

  const where = `segments.date BETWEEN '${range.from}' AND '${range.to}'`;

  const [daily, byCampaign] = await Promise.all([
    runQuery(
      `SELECT segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions
       FROM customer WHERE ${where}`,
    ),
    runQuery(
      `SELECT campaign.name, campaign.advertising_channel_type, metrics.cost_micros,
              metrics.impressions, metrics.clicks, metrics.conversions
       FROM campaign WHERE ${where}`,
    ),
  ]);

  const byDate = new Map<
    string,
    { cost: number; impressions: number; clicks: number; conversions: number }
  >();
  for (const row of daily) {
    const date = row.segments?.date;
    if (!date) continue;
    const acc = byDate.get(date) ?? { cost: 0, impressions: 0, clicks: 0, conversions: 0 };
    acc.cost += num(row.metrics?.costMicros) / MICROS;
    acc.impressions += num(row.metrics?.impressions);
    acc.clicks += num(row.metrics?.clicks);
    acc.conversions += num(row.metrics?.conversions);
    byDate.set(date, acc);
  }

  const series: SeriesPoint[] = eachDay(range).map((date) => {
    const row = byDate.get(date) ?? { cost: 0, impressions: 0, clicks: 0, conversions: 0 };
    return {
      date,
      cost: row.cost,
      impressions: row.impressions,
      clicks: row.clicks,
      conversions: row.conversions,
      cpc: row.clicks === 0 ? 0 : row.cost / row.clicks,
    };
  });

  const totals = series.reduce(
    (acc, p) => ({
      cost: acc.cost + Number(p.cost),
      impressions: acc.impressions + Number(p.impressions),
      clicks: acc.clicks + Number(p.clicks),
      conversions: acc.conversions + Number(p.conversions),
    }),
    { cost: 0, impressions: 0, clicks: 0, conversions: 0 },
  );

  // A API devolve uma linha por campanha por dia; agrega antes de listar.
  const campaigns = new Map<
    string,
    { name: string; type: string; cost: number; conversions: number }
  >();
  for (const row of byCampaign) {
    const name = row.campaign?.name ?? "—";
    const entry = campaigns.get(name) ?? {
      name,
      type: row.campaign?.advertisingChannelType ?? "—",
      cost: 0,
      conversions: 0,
    };
    entry.cost += num(row.metrics?.costMicros) / MICROS;
    entry.conversions += num(row.metrics?.conversions);
    campaigns.set(name, entry);
  }

  return {
    channel: "google-ads",
    label: "Google Ads",
    source: "live",
    range,
    fetchedAt: new Date().toISOString(),
    kpis: [
      { key: "cost", label: "Investimento", value: totals.cost, format: "currency" },
      { key: "conversions", label: "Conversões", value: totals.conversions, format: "integer" },
      {
        key: "cpa",
        label: "Custo por conversão",
        value: totals.conversions === 0 ? 0 : totals.cost / totals.conversions,
        format: "currency",
        lowerIsBetter: true,
      },
      {
        key: "cpc",
        label: "CPC médio",
        value: totals.clicks === 0 ? 0 : totals.cost / totals.clicks,
        format: "currency",
        lowerIsBetter: true,
      },
      {
        key: "ctr",
        label: "CTR",
        value: totals.impressions === 0 ? 0 : totals.clicks / totals.impressions,
        format: "percent",
      },
    ],
    series,
    seriesDefs: [
      { key: "cost", label: "Investimento", format: "currency", slot: 1 },
      { key: "conversions", label: "Conversões", format: "integer", slot: 2 },
    ],
    tables: [
      {
        title: "Campanhas",
        description: "Ordenadas por investimento no período.",
        columns: [
          { key: "name", label: "Campanha", align: "left" },
          { key: "type", label: "Tipo", align: "left" },
          { key: "cost", label: "Investimento", format: "currency", align: "right" },
          { key: "conversions", label: "Conversões", format: "integer", align: "right" },
          { key: "cpa", label: "CPA", format: "currency", align: "right" },
        ],
        rows: [...campaigns.values()]
          .map((c) => ({ ...c, cpa: c.conversions === 0 ? 0 : c.cost / c.conversions }))
          .sort((a, b) => b.cost - a.cost)
          .slice(0, 25),
      },
    ],
    notices: [],
  };
}
