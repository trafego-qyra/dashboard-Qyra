import "server-only";

import { eachDay } from "@/lib/date-range";
import type { ChannelReport, DateRange, SeriesPoint } from "@/lib/types";
import { mockOrganico } from "@/mocks/reports";
import { getCredentials, getEnv, isForceMock } from "@/server/env";
import { httpJson } from "@/server/lib/http";

/**
 * Orgânico de Instagram e Facebook via Graph API (Insights).
 * Docs: https://developers.facebook.com/docs/instagram-api/guides/insights
 *
 * A API de Insights do Instagram limita a janela a 30 dias por chamada, então
 * períodos maiores são quebrados em blocos e concatenados.
 */

interface InsightValue {
  value: number | Record<string, number>;
  end_time?: string;
}

interface InsightsResponse {
  data: Array<{ name: string; period: string; values: InsightValue[] }>;
}

interface MediaResponse {
  data: Array<{
    id: string;
    caption?: string;
    media_type?: string;
    permalink?: string;
    timestamp?: string;
    like_count?: number;
    comments_count?: number;
    insights?: { data: Array<{ name: string; values: InsightValue[] }> };
  }>;
}

const MAX_WINDOW_DAYS = 30;

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Quebra o intervalo em blocos de no máximo 30 dias. */
function chunkRange(range: DateRange): DateRange[] {
  const chunks: DateRange[] = [];
  let cursor = range.from;
  while (cursor <= range.to) {
    const end = addDays(cursor, MAX_WINDOW_DAYS - 1);
    chunks.push({ from: cursor, to: end < range.to ? end : range.to });
    cursor = addDays(end, 1);
  }
  return chunks;
}

function scalar(value: InsightValue["value"]): number {
  if (typeof value === "number") return value;
  return Object.values(value).reduce((a, b) => a + b, 0);
}

async function fetchAccountInsights(
  accountId: string,
  metrics: string[],
  chunk: DateRange,
): Promise<InsightsResponse> {
  const env = getEnv();
  const url = new URL(`https://graph.facebook.com/${env.META_API_VERSION}/${accountId}/insights`);
  url.searchParams.set("access_token", env.META_ACCESS_TOKEN as string);
  url.searchParams.set("metric", metrics.join(","));
  url.searchParams.set("period", "day");
  url.searchParams.set("since", chunk.from);
  url.searchParams.set("until", addDays(chunk.to, 1));
  return httpJson<InsightsResponse>(url.toString());
}

export async function fetchOrganicoReport(range: DateRange): Promise<ChannelReport> {
  const env = getEnv();
  const forceMock = isForceMock();

  if (forceMock || !getCredentials().metaOrganic) {
    const report = mockOrganico(range, new Date().toISOString());
    report.notices = [
      forceMock
        ? "Modo mock forçado por QYRA_FORCE_MOCK."
        : "Sem credencial de Instagram/Facebook — exibindo dados de demonstração.",
    ];
    return report;
  }

  const accountId = (env.META_IG_USER_ID ?? env.META_PAGE_ID) as string;
  const notices: string[] = [];

  const chunks = chunkRange(range);
  const responses = await Promise.all(
    chunks.map((chunk) => fetchAccountInsights(accountId, ["reach", "follower_count"], chunk)),
  );

  const reachByDate = new Map<string, number>();
  const followersByDate = new Map<string, number>();

  for (const response of responses) {
    for (const metric of response.data) {
      for (const point of metric.values) {
        if (!point.end_time) continue;
        // `end_time` é o início do dia seguinte na timezone da conta.
        const date = addDays(point.end_time.slice(0, 10), -1);
        const target = metric.name === "reach" ? reachByDate : followersByDate;
        target.set(date, (target.get(date) ?? 0) + scalar(point.value));
      }
    }
  }

  // Interações vêm da mídia publicada, não do endpoint de conta.
  const mediaUrl = new URL(`https://graph.facebook.com/${env.META_API_VERSION}/${accountId}/media`);
  mediaUrl.searchParams.set("access_token", env.META_ACCESS_TOKEN as string);
  mediaUrl.searchParams.set(
    "fields",
    "id,caption,media_type,permalink,timestamp,like_count,comments_count,insights.metric(reach)",
  );
  mediaUrl.searchParams.set("since", range.from);
  mediaUrl.searchParams.set("until", addDays(range.to, 1));
  mediaUrl.searchParams.set("limit", "100");

  let media: MediaResponse = { data: [] };
  try {
    media = await httpJson<MediaResponse>(mediaUrl.toString());
  } catch {
    // Insights de mídia dependem de permissão extra; a série de conta continua válida.
    notices.push(
      "Não foi possível carregar as publicações — verifique a permissão instagram_manage_insights.",
    );
  }

  const engagementByDate = new Map<string, number>();
  for (const item of media.data) {
    const date = item.timestamp?.slice(0, 10);
    if (!date) continue;
    const interactions = (item.like_count ?? 0) + (item.comments_count ?? 0);
    engagementByDate.set(date, (engagementByDate.get(date) ?? 0) + interactions);
  }

  const series: SeriesPoint[] = eachDay(range).map((date) => {
    const reach = reachByDate.get(date) ?? 0;
    const engagement = engagementByDate.get(date) ?? 0;
    return {
      date,
      reach,
      engagement,
      followerGrowth: followersByDate.get(date) ?? 0,
      engagementRate: reach === 0 ? 0 : engagement / reach,
    };
  });

  const totals = series.reduce(
    (acc, p) => ({
      reach: acc.reach + Number(p.reach),
      engagement: acc.engagement + Number(p.engagement),
      followerGrowth: acc.followerGrowth + Number(p.followerGrowth),
    }),
    { reach: 0, engagement: 0, followerGrowth: 0 },
  );

  return {
    channel: "organico",
    label: "Orgânico",
    source: "live",
    range,
    fetchedAt: new Date().toISOString(),
    kpis: [
      { key: "reach", label: "Alcance", value: totals.reach, format: "integer" },
      { key: "engagement", label: "Interações", value: totals.engagement, format: "integer" },
      {
        key: "engagementRate",
        label: "Taxa de engajamento",
        value: totals.reach === 0 ? 0 : totals.engagement / totals.reach,
        format: "percent",
      },
      {
        key: "followerGrowth",
        label: "Novos seguidores",
        value: totals.followerGrowth,
        format: "integer",
      },
    ],
    series,
    seriesDefs: [
      { key: "reach", label: "Alcance", format: "integer", slot: 1 },
      { key: "engagement", label: "Interações", format: "integer", slot: 2 },
    ],
    tables: [
      {
        title: "Publicações com melhor desempenho",
        description: "Ordenadas por interações no período.",
        columns: [
          { key: "post", label: "Publicação", align: "left" },
          { key: "rede", label: "Rede", align: "left" },
          { key: "reach", label: "Alcance", format: "integer", align: "right" },
          { key: "engagement", label: "Interações", format: "integer", align: "right" },
          { key: "rate", label: "Engajamento", format: "percent", align: "right" },
        ],
        rows: media.data
          .map((item) => {
            const reach = scalar(item.insights?.data?.[0]?.values?.[0]?.value ?? 0);
            const engagement = (item.like_count ?? 0) + (item.comments_count ?? 0);
            return {
              post: (item.caption ?? "Sem legenda").slice(0, 80),
              rede: item.media_type === "VIDEO" ? "Instagram · Reels" : "Instagram",
              reach,
              engagement,
              rate: reach === 0 ? 0 : engagement / reach,
            };
          })
          .sort((a, b) => b.engagement - a.engagement)
          .slice(0, 15),
      },
    ],
    notices,
  };
}
