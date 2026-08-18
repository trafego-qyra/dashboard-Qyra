import "server-only";

import { eachDay } from "@/lib/date-range";
import type { ChannelReport, DateRange, SeriesPoint } from "@/lib/types";
import { mockMetaAds } from "@/mocks/reports";
import { getCredentials, getEnv, isForceMock } from "@/server/env";
import { httpJson } from "@/server/lib/http";

/**
 * Meta Ads via Marketing API (Insights).
 * Docs: https://developers.facebook.com/docs/marketing-api/insights
 */

interface MetaInsightsRow {
  date_start: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
  actions?: Array<{ action_type: string; value: string }>;
  campaign_name?: string;
}

interface MetaInsightsResponse {
  data: MetaInsightsRow[];
  paging?: { next?: string };
}

/** Tipos de ação que a operação da Qyra conta como lead. */
const LEAD_ACTIONS = new Set([
  "lead",
  "offsite_conversion.fb_pixel_lead",
  "onsite_conversion.lead_grouped",
]);

function countLeads(row: MetaInsightsRow): number {
  return (row.actions ?? [])
    .filter((a) => LEAD_ACTIONS.has(a.action_type))
    .reduce((acc, a) => acc + Number(a.value || 0), 0);
}

function num(value: string | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function fetchInsights(
  range: DateRange,
  params: Record<string, string>,
): Promise<MetaInsightsRow[]> {
  const env = getEnv();
  const accountId = env.META_AD_ACCOUNT_ID as string;
  const account = accountId.startsWith("act_") ? accountId : `act_${accountId}`;

  const url = new URL(`https://graph.facebook.com/${env.META_API_VERSION}/${account}/insights`);
  url.searchParams.set("access_token", env.META_ACCESS_TOKEN as string);
  url.searchParams.set("time_range", JSON.stringify({ since: range.from, until: range.to }));
  url.searchParams.set("limit", "500");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const rows: MetaInsightsRow[] = [];
  let next: string | undefined = url.toString();

  // A paginação da Graph API devolve a URL completa do próximo bloco.
  while (next && rows.length < 5_000) {
    const page: MetaInsightsResponse = await httpJson<MetaInsightsResponse>(next);
    // A Graph API sempre devolve `data` em sucesso, mas uma resposta
    // inesperada não pode virar TypeError no meio do relatório.
    rows.push(...(page.data ?? []));
    next = page.paging?.next;
  }

  return rows;
}

export async function fetchMetaAdsReport(range: DateRange): Promise<ChannelReport> {
  const forceMock = isForceMock();

  if (forceMock || !getCredentials().metaAds) {
    const report = mockMetaAds(range, new Date().toISOString());
    report.notices = [
      forceMock
        ? "Modo mock forçado por QYRA_FORCE_MOCK."
        : "Sem credencial do Meta Ads — exibindo dados de demonstração.",
    ];
    return report;
  }

  const [daily, byCampaign] = await Promise.all([
    fetchInsights(range, {
      fields: "spend,impressions,clicks,ctr,actions",
      time_increment: "1",
      level: "account",
    }),
    fetchInsights(range, {
      fields: "campaign_name,spend,impressions,clicks,ctr,actions",
      level: "campaign",
    }),
  ]);

  // A API omite dias sem entrega; a série precisa deles para não "pular" no eixo.
  const byDate = new Map(daily.map((row) => [row.date_start, row]));
  const series: SeriesPoint[] = eachDay(range).map((date) => {
    const row = byDate.get(date);
    const spend = num(row?.spend);
    const impressions = num(row?.impressions);
    const clicks = num(row?.clicks);
    const leads = row ? countLeads(row) : 0;
    return {
      date,
      spend,
      impressions,
      clicks,
      leads,
      ctr: impressions === 0 ? 0 : clicks / impressions,
      cpl: leads === 0 ? 0 : spend / leads,
    };
  });

  const totals = series.reduce(
    (acc, p) => ({
      spend: acc.spend + Number(p.spend),
      impressions: acc.impressions + Number(p.impressions),
      clicks: acc.clicks + Number(p.clicks),
      leads: acc.leads + Number(p.leads),
    }),
    { spend: 0, impressions: 0, clicks: 0, leads: 0 },
  );

  return {
    channel: "meta-ads",
    label: "Meta Ads",
    source: "live",
    range,
    fetchedAt: new Date().toISOString(),
    kpis: [
      { key: "spend", label: "Investimento", value: totals.spend, format: "currency" },
      { key: "leads", label: "Leads", value: totals.leads, format: "integer" },
      {
        key: "cpl",
        label: "Custo por lead",
        value: totals.leads === 0 ? 0 : totals.spend / totals.leads,
        format: "currency",
        lowerIsBetter: true,
      },
      {
        key: "ctr",
        label: "CTR",
        value: totals.impressions === 0 ? 0 : totals.clicks / totals.impressions,
        format: "percent",
      },
      { key: "clicks", label: "Cliques", value: totals.clicks, format: "integer" },
    ],
    series,
    seriesDefs: [
      { key: "spend", label: "Investimento", format: "currency", slot: 1 },
      { key: "leads", label: "Leads", format: "integer", slot: 2 },
    ],
    tables: [
      {
        title: "Campanhas",
        description: "Ordenadas por investimento no período.",
        columns: [
          { key: "name", label: "Campanha", align: "left" },
          { key: "spend", label: "Investimento", format: "currency", align: "right" },
          { key: "leads", label: "Leads", format: "integer", align: "right" },
          { key: "cpl", label: "CPL", format: "currency", align: "right" },
          { key: "ctr", label: "CTR", format: "percent", align: "right" },
        ],
        rows: byCampaign
          .map((row) => {
            const spend = num(row.spend);
            const leads = countLeads(row);
            const impressions = num(row.impressions);
            const clicks = num(row.clicks);
            return {
              name: row.campaign_name ?? "—",
              spend,
              leads,
              cpl: leads === 0 ? 0 : spend / leads,
              ctr: impressions === 0 ? 0 : clicks / impressions,
            };
          })
          .sort((a, b) => b.spend - a.spend)
          .slice(0, 25),
      },
    ],
    notices: [],
  };
}
