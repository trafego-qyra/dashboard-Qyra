import { avisoOperacao } from "@/lib/avisos";
import "server-only";

import { MAX_CRIATIVOS } from "@/lib/criativos";
import { eachDay } from "@/lib/date-range";
import type { ChannelReport, ContentCard, DateRange, Notice, SeriesPoint } from "@/lib/types";
import { mockOrganico } from "@/mocks/reports";
import { getCredentials, getEnv, isForceMock } from "@/server/env";
import { httpJson, metaAuthHeaders } from "@/server/lib/http";

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
    media_url?: string;
    thumbnail_url?: string;
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
  url.searchParams.set("metric", metrics.join(","));
  url.searchParams.set("period", "day");
  url.searchParams.set("since", chunk.from);
  url.searchParams.set("until", addDays(chunk.to, 1));
  // Token no cabeçalho, nunca na query: a Graph ecoa a requisição na mensagem
  // de erro, e a query string vai parar em log de plataforma.
  return httpJson<InsightsResponse>(url.toString(), {
    headers: metaAuthHeaders(env.META_ACCESS_TOKEN as string),
  });
}

interface TotalValueResponse {
  data?: Array<{ name: string; total_value?: { value?: number } }>;
}

/**
 * Alcance do período inteiro, com pessoas contadas uma vez só.
 *
 * Somar o alcance diário é errado: quem viu na segunda e voltou na quinta
 * entra duas vezes, e num mês o número infla várias vezes. `total_value` é o
 * que a própria Meta usa para deduplicar dentro da janela.
 */
async function fetchReachTotal(accountId: string, chunk: DateRange): Promise<number | null> {
  const env = getEnv();
  const url = new URL(`https://graph.facebook.com/${env.META_API_VERSION}/${accountId}/insights`);
  url.searchParams.set("metric", "reach");
  url.searchParams.set("metric_type", "total_value");
  url.searchParams.set("since", chunk.from);
  url.searchParams.set("until", addDays(chunk.to, 1));

  try {
    const resposta = await httpJson<TotalValueResponse>(url.toString(), {
      headers: metaAuthHeaders(env.META_ACCESS_TOKEN as string),
    });
    const valor = resposta.data?.find((m) => m.name === "reach")?.total_value?.value;
    return typeof valor === "number" ? valor : null;
  } catch {
    // Métrica indisponível nesta versão ou conta: quem chama decide o que
    // fazer, sem derrubar o relatório inteiro por causa de um indicador.
    return null;
  }
}

export async function fetchOrganicoReport(range: DateRange): Promise<ChannelReport> {
  const env = getEnv();
  const forceMock = isForceMock();

  if (forceMock || !getCredentials().metaOrganic) {
    const report = mockOrganico(range, new Date().toISOString());
    report.notices = [
      avisoOperacao(
        forceMock
          ? "Modo mock forçado por QYRA_FORCE_MOCK."
          : "Sem credencial de Instagram/Facebook — exibindo dados de demonstração.",
      ),
    ];
    return report;
  }

  const accountId = env.META_IG_USER_ID as string;
  const notices: Notice[] = [];

  const chunks = chunkRange(range);
  const [responses, totaisDeAlcance] = await Promise.all([
    Promise.all(
      chunks.map((chunk) => fetchAccountInsights(accountId, ["reach", "follower_count"], chunk)),
    ),
    Promise.all(chunks.map((chunk) => fetchReachTotal(accountId, chunk))),
  ]);

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
  mediaUrl.searchParams.set(
    "fields",
    // `media_url` é a arte do post; para vídeo ela é o arquivo, e o quadro de
    // capa vem em `thumbnail_url`. Os dois entram para o cartão ter prévia.
    "id,caption,media_type,permalink,timestamp,like_count,comments_count,media_url,thumbnail_url,insights.metric(reach)",
  );
  mediaUrl.searchParams.set("since", range.from);
  mediaUrl.searchParams.set("until", addDays(range.to, 1));
  mediaUrl.searchParams.set("limit", "100");

  let media: MediaResponse = { data: [] };
  try {
    media = await httpJson<MediaResponse>(mediaUrl.toString(), {
      headers: metaAuthHeaders(env.META_ACCESS_TOKEN as string),
    });
  } catch {
    // Insights de mídia dependem de permissão extra; a série de conta continua válida.
    notices.push(
      avisoOperacao(
        "Não foi possível carregar as publicações — verifique a permissão instagram_manage_insights.",
      ),
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
      engagement: acc.engagement + Number(p.engagement),
      followerGrowth: acc.followerGrowth + Number(p.followerGrowth),
      // Guardado só para o caso de a métrica deduplicada não vir: soma de
      // alcance diário conta a mesma pessoa uma vez por dia.
      alcanceSomado: acc.alcanceSomado + Number(p.reach),
    }),
    { engagement: 0, followerGrowth: 0, alcanceSomado: 0 },
  );

  // Cada bloco vem deduplicado pela Meta. Entre blocos não há como deduplicar —
  // acima de 30 dias o total soma janelas, e o rótulo diz isso.
  const deduplicado = totaisDeAlcance.every((t) => t !== null);
  const alcance = deduplicado
    ? (totaisDeAlcance as number[]).reduce((a, b) => a + b, 0)
    : totals.alcanceSomado;

  const alcanceExato = deduplicado && chunks.length === 1;
  const dicaDeAlcance = alcanceExato
    ? "Pessoas distintas alcançadas no período, contadas uma única vez."
    : deduplicado
      ? "A Meta deduplica em janelas de 30 dias. Como o período é maior, quem apareceu em dois meses conta duas vezes."
      : "Soma do alcance diário: quem voltou em dias diferentes conta uma vez por dia. A métrica deduplicada não veio da Meta.";

  /**
   * As publicações como cartão, com a arte.
   *
   * Mesma pergunta do lado pago, outra métrica: aqui "melhor" é o que
   * engajou, não o que custou menos. A imagem passa pelo proxio do próprio
   * domínio — a URL do CDN da Meta expira e a CSP do painel não abre para
   * host de terceiro.
   */
  const publicacoes: ContentCard[] = media.data
    .map((item) => {
      const reach = scalar(item.insights?.data?.[0]?.values?.[0]?.value ?? 0);
      const curtidas = item.like_count ?? 0;
      const comentarios = item.comments_count ?? 0;
      const engagement = curtidas + comentarios;
      return { item, reach, curtidas, comentarios, engagement };
    })
    .sort((a, b) => b.engagement - a.engagement)
    .slice(0, MAX_CRIATIVOS)
    .map(({ item, reach, curtidas, comentarios, engagement }) => ({
      id: item.id,
      title: (item.caption ?? "Sem legenda").slice(0, 70),
      subtitle: [
        item.media_type === "VIDEO" ? "Reels" : "Publicação",
        item.timestamp?.slice(0, 10).split("-").reverse().join("/"),
      ]
        .filter(Boolean)
        .join(" · "),
      imageUrl: `/publicacoes/${item.id}/imagem`,
      link: item.permalink,
      metrics: [
        { label: "Alcance", value: reach, format: "integer" as const },
        { label: "Interações", value: engagement, format: "integer" as const },
        { label: "Curtidas", value: curtidas, format: "integer" as const },
        { label: "Comentários", value: comentarios, format: "integer" as const },
        {
          label: "Engajamento",
          value: reach === 0 ? 0 : engagement / reach,
          format: "percent" as const,
        },
      ],
    }));

  return {
    channel: "organico",
    label: "Orgânico",
    source: "live",
    range,
    fetchedAt: new Date().toISOString(),
    kpis: [
      { key: "reach", label: "Alcance", value: alcance, format: "integer", hint: dicaDeAlcance },
      { key: "engagement", label: "Interações", value: totals.engagement, format: "integer" },
      {
        key: "engagementRate",
        label: "Taxa de engajamento",
        value: alcance === 0 ? 0 : totals.engagement / alcance,
        format: "percent",
        hint: "Interações divididas pelo alcance. Com alcance inflado o denominador cresce e a taxa cai — por isso ele é deduplicado antes.",
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
    creatives: publicacoes,
    creativesLabel: {
      title: "Publicações com melhor desempenho",
      description:
        "Ordenadas por interações. Clique no título para abrir a publicação no Instagram.",
    },
    tables: [],
    notices,
  };
}
