import { avisoOperacao } from "@/lib/avisos";
import "server-only";

import { type AdCreative, MAX_CRIATIVOS, ordenarCriativos } from "@/lib/criativos";
import { eachDay } from "@/lib/date-range";
import type { ChannelReport, ContentCard, DateRange, SeriesPoint } from "@/lib/types";
import { mockMetaAds } from "@/mocks/reports";
import { getCredentials, getEnv, isForceMock } from "@/server/env";
import { httpJson, metaAuthHeaders } from "@/server/lib/http";

/**
 * Meta Ads via Marketing API (Insights).
 * Docs: https://developers.facebook.com/docs/marketing-api/insights
 */

/** `{action_type, value}` — o formato que a Insights usa para toda métrica de ação. */
type AcoesDaMeta = Array<{ action_type: string; value: string }>;

interface MetaInsightsRow {
  date_start: string;
  ad_id?: string;
  ad_name?: string;
  spend?: string;
  impressions?: string;
  /** Pessoas distintas alcançadas. Não é aditivo entre dias. */
  reach?: string;
  clicks?: string;
  /** Cliques no link do anúncio, sem contar clique em curtida, comentário etc. */
  inline_link_clicks?: string;
  ctr?: string;
  actions?: AcoesDaMeta;
  /** Reproduções de vídeo — a base de retenção que a própria Meta usa. */
  video_play_actions?: AcoesDaMeta;
  video_p25_watched_actions?: AcoesDaMeta;
  video_p50_watched_actions?: AcoesDaMeta;
  video_p75_watched_actions?: AcoesDaMeta;
  video_p100_watched_actions?: AcoesDaMeta;
  campaign_name?: string;
}

interface MetaInsightsResponse {
  data: MetaInsightsRow[];
  paging?: { next?: string };
}

/**
 * Tipos de ação detalhados que a operação da Qyra conta como lead.
 *
 * O tipo agregado `lead` fica **fora** deste conjunto de propósito: ele já
 * soma os detalhados, e incluí-lo aqui faria a contagem dobrar. Ver `countLeads`.
 */
const DETAILED_LEAD_ACTIONS = new Set([
  "offsite_conversion.fb_pixel_lead",
  "onsite_conversion.lead_grouped",
]);

/**
 * Conta os leads de uma linha de insights.
 *
 * A Meta devolve a mesma conversão em níveis diferentes de uma hierarquia: o
 * tipo agregado `lead` já **contém** `offsite_conversion.fb_pixel_lead` e
 * `onsite_conversion.lead_grouped`. Somar os três dobra o número de leads e
 * corta o custo por lead pela metade — exibido com a mesma confiança do valor
 * correto.
 *
 * Por isso: havendo o agregado, ele é a resposta. Só na ausência dele os
 * detalhados são somados entre si.
 */
function countLeads(row: MetaInsightsRow): number {
  const acoes = row.actions ?? [];

  const agregado = acoes.find((a) => a.action_type === "lead");
  if (agregado) return Number(agregado.value || 0);

  return acoes
    .filter((a) => DETAILED_LEAD_ACTIONS.has(a.action_type))
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
  url.searchParams.set("time_range", JSON.stringify({ since: range.from, until: range.to }));
  url.searchParams.set("limit", "500");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const rows: MetaInsightsRow[] = [];
  let next: string | undefined = url.toString();

  // A paginação da Graph API devolve a URL completa do próximo bloco.
  while (next && rows.length < 5_000) {
    const page: MetaInsightsResponse = await httpJson<MetaInsightsResponse>(next, {
      headers: metaAuthHeaders(env.META_ACCESS_TOKEN as string),
    });
    // A Graph API sempre devolve `data` em sucesso, mas uma resposta
    // inesperada não pode virar TypeError no meio do relatório.
    rows.push(...(page.data ?? []));
    next = page.paging?.next;
  }

  return rows;
}

/**
 * `cpm` e `frequency` não são pedidos: a Meta os devolve por linha, e somar
 * média de dia com média de dia dá número errado. Ambos são recalculados dos
 * totais — CPM sobre impressões, frequência sobre alcance.
 */
const CAMPOS_DE_METRICA = [
  "spend",
  "impressions",
  "reach",
  "clicks",
  "inline_link_clicks",
  "ctr",
  "actions",
  "video_play_actions",
  "video_p25_watched_actions",
  "video_p50_watched_actions",
  "video_p75_watched_actions",
  "video_p100_watched_actions",
].join(",");

/** Soma uma métrica de ação da Meta, que sempre vem como lista de pares. */
function somarAcoes(acoes: AcoesDaMeta | undefined): number {
  return (acoes ?? []).reduce((total, item) => total + num(item.value), 0);
}

interface AdsEdgeResponse {
  data?: Array<{
    id: string;
    creative?: {
      /** URL pública do post no Instagram, quando o anúncio roda de um post. */
      instagram_permalink_url?: string;
      /** `{page_id}_{post_id}` — vira a URL pública do post no Facebook. */
      effective_object_story_id?: string;
    };
  }>;
}

/** Link visível para quem abre o relatório, com o rótulo certo. */
interface LinkDaPeca {
  url: string;
  label: string;
}

/**
 * Link de pré-visualização de cada anúncio, por ID.
 *
 * A Insights não devolve isso — é a borda `/ads` da conta. Enriquecimento
 * puro: sem ele o cartão continua completo, só não abre a peça.
 */
/**
 * `{page_id}_{post_id}` -> URL pública do post no Facebook.
 *
 * A Meta devolve os dois IDs colados. Post de página é público, então o link
 * abre para qualquer pessoa.
 */
function urlDoPostNoFacebook(storyId: string | undefined): string | null {
  const partes = storyId?.split("_");
  if (partes?.length !== 2 || !partes[0] || !partes[1]) return null;
  return `https://www.facebook.com/${partes[0]}/posts/${partes[1]}`;
}

/**
 * Link público de cada anúncio, por ID.
 *
 * `preview_shareable_link` foi descartado de propósito: ele exige estar logado
 * numa conta com acesso à conta de anúncios, e para quem abre o relatório vira
 * uma tela de login. Botão que não leva a lugar nenhum é pior que botão
 * nenhum — um anúncio sem peça pública simplesmente não ganha botão.
 */
async function buscarLinksDeAnuncio(): Promise<Map<string, LinkDaPeca>> {
  const env = getEnv();
  const url = new URL(
    `https://graph.facebook.com/${env.META_API_VERSION}/act_${(env.META_AD_ACCOUNT_ID as string).replace(/^act_/, "")}/ads`,
  );
  url.searchParams.set("fields", "id,creative{instagram_permalink_url,effective_object_story_id}");
  url.searchParams.set("limit", "200");

  try {
    const resposta = await httpJson<AdsEdgeResponse>(url.toString(), {
      headers: metaAuthHeaders(env.META_ACCESS_TOKEN as string),
    });

    const mapa = new Map<string, LinkDaPeca>();
    for (const anuncio of resposta.data ?? []) {
      const instagram = anuncio.creative?.instagram_permalink_url;
      if (instagram) {
        mapa.set(anuncio.id, { url: instagram, label: "Ver no Instagram" });
        continue;
      }
      const facebook = urlDoPostNoFacebook(anuncio.creative?.effective_object_story_id);
      if (facebook) mapa.set(anuncio.id, { url: facebook, label: "Ver publicação" });
    }
    return mapa;
  } catch {
    return new Map();
  }
}

/** Monta os cartões de anúncio. A ordem vem de `ordenarCriativos`. */
function montarCriativos(
  porAnuncio: MetaInsightsRow[],
  links: Map<string, LinkDaPeca>,
): ContentCard[] {
  const cartoes = porAnuncio.map((row) => {
    const spend = num(row.spend);
    const impressions = num(row.impressions);
    const clicks = num(row.clicks);
    const leads = countLeads(row);
    const reproducoes = somarAcoes(row.video_play_actions);
    return {
      id: row.ad_id ?? "",
      name: row.ad_name ?? "—",
      campaign: row.campaign_name,
      spend,
      impressions,
      ctr: impressions === 0 ? 0 : clicks / impressions,
      cpm: impressions === 0 ? 0 : (spend / impressions) * 1000,
      linkClicks: num(row.inline_link_clicks),
      leads,
      cpl: leads === 0 ? 0 : spend / leads,
      // Sem reprodução não é vídeo — ou é vídeo que ninguém abriu. Nos dois
      // casos, mostrar uma régua de retenção zerada só ocupa espaço.
      video:
        reproducoes > 0
          ? {
              reproducoes,
              p25: somarAcoes(row.video_p25_watched_actions) / reproducoes,
              p50: somarAcoes(row.video_p50_watched_actions) / reproducoes,
              p75: somarAcoes(row.video_p75_watched_actions) / reproducoes,
              p100: somarAcoes(row.video_p100_watched_actions) / reproducoes,
            }
          : undefined,
    } satisfies AdCreative;
  });

  return ordenarCriativos(cartoes)
    .slice(0, MAX_CRIATIVOS)
    .map((c) => ({
      id: c.id,
      title: c.name,
      subtitle: c.campaign,
      imageUrl: c.id ? `/criativos/${c.id}/imagem` : undefined,
      link: links.get(c.id)?.url,
      linkLabel: links.get(c.id)?.label,
      metrics: [
        { label: "Investimento", value: c.spend, format: "currency" as const },
        { label: "Leads", value: c.leads, format: "integer" as const },
        { label: "CPL", value: c.cpl, format: "currency" as const },
        { label: "CTR", value: c.ctr, format: "percent" as const },
        { label: "CPM", value: c.cpm, format: "currency" as const },
        { label: "Impressões", value: c.impressions, format: "integer" as const },
      ],
      video: c.video,
    }));
}

export async function fetchMetaAdsReport(range: DateRange): Promise<ChannelReport> {
  const forceMock = isForceMock();

  if (forceMock || !getCredentials().metaAds) {
    const report = mockMetaAds(range, new Date().toISOString());
    report.notices = [
      avisoOperacao(
        forceMock
          ? "Modo mock forçado por QYRA_FORCE_MOCK."
          : "Sem credencial do Meta Ads — exibindo dados de demonstração.",
      ),
    ];
    return report;
  }

  const [daily, byCampaign, porAnuncio, linksDeAnuncio] = await Promise.all([
    fetchInsights(range, {
      fields: CAMPOS_DE_METRICA,
      time_increment: "1",
      level: "account",
    }),
    fetchInsights(range, {
      fields: `campaign_name,${CAMPOS_DE_METRICA}`,
      level: "campaign",
    }),
    // Enriquecimento, não requisito: a tela existe sem os criativos. Uma falha
    // aqui não pode derrubar o relatório inteiro — foi assim que a página do
    // Google Ads morreu com o dado pronto ao lado.
    fetchInsights(range, {
      fields: `ad_id,ad_name,campaign_name,${CAMPOS_DE_METRICA}`,
      level: "ad",
    }).catch(() => [] as MetaInsightsRow[]),
    buscarLinksDeAnuncio(),
  ]);

  // A API omite dias sem entrega; a série precisa deles para não "pular" no eixo.
  const byDate = new Map(daily.map((row) => [row.date_start, row]));
  const series: SeriesPoint[] = eachDay(range).map((date) => {
    const row = byDate.get(date);
    const spend = num(row?.spend);
    const impressions = num(row?.impressions);
    const clicks = num(row?.clicks);
    const linkClicks = num(row?.inline_link_clicks);
    const leads = row ? countLeads(row) : 0;
    return {
      date,
      spend,
      impressions,
      clicks,
      linkClicks,
      leads,
      ctr: impressions === 0 ? 0 : clicks / impressions,
      cpm: impressions === 0 ? 0 : (spend / impressions) * 1000,
      cpl: leads === 0 ? 0 : spend / leads,
    };
  });

  const totals = series.reduce(
    (acc, p) => ({
      spend: acc.spend + Number(p.spend),
      impressions: acc.impressions + Number(p.impressions),
      clicks: acc.clicks + Number(p.clicks),
      linkClicks: acc.linkClicks + Number(p.linkClicks),
      leads: acc.leads + Number(p.leads),
    }),
    { spend: 0, impressions: 0, clicks: 0, linkClicks: 0, leads: 0 },
  );

  // Alcance conta pessoas distintas: somar os dias contaria de novo quem voltou.
  // O valor do período só existe numa consulta sem `time_increment`, que é a de
  // campanha — e mesmo ela só é somável porque uma pessoa alcançada por duas
  // campanhas é rara o bastante para o número seguir útil. O rótulo avisa.
  const alcance = byCampaign.reduce((total, row) => total + num(row.reach), 0);

  const video = {
    reproducoes: byCampaign.reduce((t, r) => t + somarAcoes(r.video_play_actions), 0),
    p25: byCampaign.reduce((t, r) => t + somarAcoes(r.video_p25_watched_actions), 0),
    p50: byCampaign.reduce((t, r) => t + somarAcoes(r.video_p50_watched_actions), 0),
    p75: byCampaign.reduce((t, r) => t + somarAcoes(r.video_p75_watched_actions), 0),
    p100: byCampaign.reduce((t, r) => t + somarAcoes(r.video_p100_watched_actions), 0),
  };

  return {
    channel: "meta-ads",
    label: "Meta Ads",
    source: "live",
    range,
    fetchedAt: new Date().toISOString(),
    kpis: [
      { key: "spend", label: "Investimento", value: totals.spend, format: "currency" },
      { key: "impressions", label: "Impressões", value: totals.impressions, format: "integer" },
      {
        key: "reach",
        label: "Alcance",
        value: alcance,
        format: "integer",
        hint: "Pessoas distintas que viram os anúncios. Somado entre campanhas, então quem foi alcançado por mais de uma campanha aparece mais de uma vez.",
      },
      {
        key: "cpm",
        label: "CPM",
        value: totals.impressions === 0 ? 0 : (totals.spend / totals.impressions) * 1000,
        format: "currency",
        lowerIsBetter: true,
        hint: "Custo por mil impressões, calculado sobre o total do período — não é a média das médias diárias.",
      },
      {
        key: "ctr",
        label: "CTR",
        value: totals.impressions === 0 ? 0 : totals.clicks / totals.impressions,
        format: "percent",
      },
      {
        key: "frequency",
        label: "Frequência",
        value: alcance === 0 ? 0 : totals.impressions / alcance,
        format: "decimal",
        lowerIsBetter: true,
        hint: "Quantas vezes, em média, cada pessoa alcançada viu um anúncio.",
      },
      {
        key: "linkClicks",
        label: "Cliques no link",
        value: totals.linkClicks,
        format: "integer",
        hint: "Só cliques que levaram ao destino. O total de cliques inclui curtida, comentário e expansão de imagem.",
      },
      {
        key: "leads",
        label: "Leads",
        value: totals.leads,
        format: "integer",
        hint: "Conversões que a Meta atribuiu aos anúncios do período. A atribuição padrão é de 7 dias por clique e 1 dia por visualização, então campanhas de topo e meio de funil também recebem crédito.",
      },
      {
        key: "cpl",
        label: "Custo por lead",
        value: totals.leads === 0 ? 0 : totals.spend / totals.leads,
        format: "currency",
        lowerIsBetter: true,
      },
    ],
    series,
    seriesDefs: [
      { key: "spend", label: "Investimento", format: "currency", slot: 1 },
      { key: "leads", label: "Leads", format: "integer", slot: 2 },
      { key: "impressions", label: "Impressões", format: "integer", slot: 3 },
      { key: "cpm", label: "CPM", format: "currency", slot: 4 },
    ],
    creatives: montarCriativos(porAnuncio, linksDeAnuncio),
    creativesLabel: {
      title: "Melhores criativos",
      description: porAnuncio.some((r) => countLeads(r) > 0)
        ? "Ordenados por leads, desempatando pelo menor custo por lead."
        : "Sem lead atribuído no período, então a ordem é por investimento.",
    },
    tables: [
      {
        title: "Campanhas",
        description: "Ordenadas por investimento no período.",
        columns: [
          { key: "name", label: "Campanha", align: "left" },
          { key: "spend", label: "Investimento", format: "currency", align: "right" },
          { key: "impressions", label: "Impressões", format: "integer", align: "right" },
          { key: "cpm", label: "CPM", format: "currency", align: "right" },
          { key: "ctr", label: "CTR", format: "percent", align: "right" },
          { key: "linkClicks", label: "Cliques no link", format: "integer", align: "right" },
          { key: "leads", label: "Leads", format: "integer", align: "right" },
          { key: "cpl", label: "CPL", format: "currency", align: "right" },
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
              impressions,
              cpm: impressions === 0 ? 0 : (spend / impressions) * 1000,
              ctr: impressions === 0 ? 0 : clicks / impressions,
              linkClicks: num(row.inline_link_clicks),
              leads,
              cpl: leads === 0 ? 0 : spend / leads,
            };
          })
          .sort((a, b) => b.spend - a.spend),
      },
      // Só entra quando existe vídeo na conta: uma tabela de zeros ocupa espaço
      // e sugere que a campanha performou mal, quando ela nem é de vídeo.
      ...(video.reproducoes > 0
        ? [
            {
              title: "Retenção de vídeo",
              description:
                "Quantas pessoas seguiram assistindo até cada marca. A porcentagem é sobre quem começou a assistir, que é a base usada pela própria Meta.",
              columns: [
                { key: "etapa", label: "Etapa", align: "left" as const },
                {
                  key: "pessoas",
                  label: "Pessoas",
                  format: "integer" as const,
                  align: "right" as const,
                },
                {
                  key: "retencao",
                  label: "% de quem começou",
                  format: "percent" as const,
                  align: "right" as const,
                },
              ],
              rows: [
                { etapa: "Começou a assistir", pessoas: video.reproducoes, retencao: 1 },
                {
                  etapa: "Assistiu 25%",
                  pessoas: video.p25,
                  retencao: video.p25 / video.reproducoes,
                },
                {
                  etapa: "Assistiu 50%",
                  pessoas: video.p50,
                  retencao: video.p50 / video.reproducoes,
                },
                {
                  etapa: "Assistiu 75%",
                  pessoas: video.p75,
                  retencao: video.p75 / video.reproducoes,
                },
                {
                  etapa: "Assistiu até o fim",
                  pessoas: video.p100,
                  retencao: video.p100 / video.reproducoes,
                },
              ],
            },
          ]
        : []),
    ],
    notices: [],
  };
}
