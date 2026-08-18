/**
 * Relatórios fictícios por canal, no mesmo contrato dos conectores reais.
 *
 * Servem para (a) rodar o dashboard sem credencial, (b) fixture dos testes e
 * (c) storybook visual de estados. Números calibrados para uma operação de
 * tráfego de porte médio — o objetivo é UI realista, não previsão.
 */
import { eachDay } from "@/lib/date-range";
import type { ChannelReport, DateRange, SeriesPoint } from "@/lib/types";
import { dailyValue, noise } from "./generator";

const NOW = "2026-01-01T00:00:00.000Z";

function sum(points: SeriesPoint[], key: string): number {
  return points.reduce((acc, p) => acc + (Number(p[key]) || 0), 0);
}

function safeDiv(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

/* ------------------------------------------------------------------ Meta Ads */

export function mockMetaAds(range: DateRange, fetchedAt = NOW): ChannelReport {
  const days = eachDay(range);
  const series: SeriesPoint[] = days.map((date) => {
    const spend = dailyValue("meta:spend", date, 640);
    const impressions = dailyValue("meta:impr", date, 78_000);
    const clicks = dailyValue("meta:clicks", date, 1_240);
    const leads = dailyValue("meta:leads", date, 34);
    return {
      date,
      spend: Math.round(spend * 100) / 100,
      impressions: Math.round(impressions),
      clicks: Math.round(clicks),
      leads: Math.round(leads),
      ctr: safeDiv(clicks, impressions),
      cpl: safeDiv(spend, Math.max(1, Math.round(leads))),
    };
  });

  const spend = sum(series, "spend");
  const clicks = sum(series, "clicks");
  const impressions = sum(series, "impressions");
  const leads = sum(series, "leads");

  return {
    channel: "meta-ads",
    label: "Meta Ads",
    source: "mock",
    range,
    fetchedAt,
    kpis: [
      {
        key: "spend",
        label: "Investimento",
        value: spend,
        previousValue: spend * 0.91,
        format: "currency",
      },
      {
        key: "leads",
        label: "Leads",
        value: leads,
        previousValue: leads * 0.84,
        format: "integer",
      },
      {
        key: "cpl",
        label: "Custo por lead",
        value: safeDiv(spend, leads),
        previousValue: safeDiv(spend * 0.91, leads * 0.84),
        format: "currency",
        lowerIsBetter: true,
        hint: "Investimento dividido pelos leads do período.",
      },
      {
        key: "ctr",
        label: "CTR",
        value: safeDiv(clicks, impressions),
        previousValue: safeDiv(clicks, impressions) * 0.96,
        format: "percent",
      },
      {
        key: "clicks",
        label: "Cliques",
        value: clicks,
        previousValue: clicks * 0.93,
        format: "integer",
      },
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
        rows: [
          "Conversão | Emagrecimento | Broad",
          "Conversão | Terapia Injetável | Lookalike 1%",
          "Tráfego | Institucional | Retargeting",
          "Conversão | Check-up | Interesses saúde",
          "Reconhecimento | Marca | Vídeo 15s",
        ].map((name, i) => {
          const s = spend * [0.34, 0.26, 0.17, 0.14, 0.09][i];
          const l = Math.round(leads * [0.38, 0.29, 0.12, 0.16, 0.05][i]);
          return {
            name,
            spend: Math.round(s * 100) / 100,
            leads: l,
            cpl: Math.round(safeDiv(s, l) * 100) / 100,
            ctr: 0.009 + noise(`meta-ctr-campanha-${i}-${name.length}`) * 0.026,
          };
        }),
      },
      {
        title: "Origem das conversões",
        description:
          "Toda ação registrada no período, e quais delas o painel conta como lead. A Meta credita uma conversão a qualquer anúncio que a pessoa clicou nos últimos 7 dias ou viu no último dia — inclusive campanhas de topo de funil.",
        columns: [
          { key: "acao", label: "Ação", align: "left" },
          { key: "identificador", label: "Identificador na Meta", align: "left" },
          { key: "quantidade", label: "Quantidade", format: "integer", align: "right" },
          { key: "contaComoLead", label: "Conta como lead", align: "right" },
        ],
        rows: [
          ["Lead pelo pixel do site", "offsite_conversion.fb_pixel_lead", 0.72, "sim"],
          ["Visualização da página de destino", "landing_page_view", 12.4, "não"],
          ["Clique no link", "link_click", 26.8, "não"],
          ["Engajamento com a publicação", "post_engagement", 41.2, "não"],
          ["Lead por formulário instantâneo", "onsite_conversion.lead_grouped", 0.28, "sim"],
        ].map(([acao, identificador, fator, contaComoLead]) => ({
          acao: acao as string,
          identificador: identificador as string,
          quantidade: Math.round(leads * (fator as number)),
          contaComoLead: contaComoLead as string,
        })),
      },
    ],
    notices: [],
  };
}

/* ---------------------------------------------------------------- Google Ads */

export function mockGoogleAds(range: DateRange, fetchedAt = NOW): ChannelReport {
  const days = eachDay(range);
  const series: SeriesPoint[] = days.map((date) => {
    const cost = dailyValue("gads:cost", date, 520);
    const impressions = dailyValue("gads:impr", date, 22_000);
    const clicks = dailyValue("gads:clicks", date, 890);
    const conversions = dailyValue("gads:conv", date, 27);
    return {
      date,
      cost: Math.round(cost * 100) / 100,
      impressions: Math.round(impressions),
      clicks: Math.round(clicks),
      conversions: Math.round(conversions),
      cpc: safeDiv(cost, Math.max(1, Math.round(clicks))),
    };
  });

  const cost = sum(series, "cost");
  const clicks = sum(series, "clicks");
  const impressions = sum(series, "impressions");
  const conversions = sum(series, "conversions");

  return {
    channel: "google-ads",
    label: "Google Ads",
    source: "mock",
    range,
    fetchedAt,
    kpis: [
      {
        key: "cost",
        label: "Investimento",
        value: cost,
        previousValue: cost * 1.04,
        format: "currency",
      },
      {
        key: "conversions",
        label: "Conversões",
        value: conversions,
        previousValue: conversions * 0.89,
        format: "integer",
      },
      {
        key: "cpa",
        label: "Custo por conversão",
        value: safeDiv(cost, conversions),
        previousValue: safeDiv(cost * 1.04, conversions * 0.89),
        format: "currency",
        lowerIsBetter: true,
      },
      {
        key: "cpc",
        label: "CPC médio",
        value: safeDiv(cost, clicks),
        previousValue: safeDiv(cost, clicks) * 1.07,
        format: "currency",
        lowerIsBetter: true,
      },
      {
        key: "ctr",
        label: "CTR",
        value: safeDiv(clicks, impressions),
        previousValue: safeDiv(clicks, impressions) * 0.98,
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
        rows: [
          ["Search | Marca", "Pesquisa"],
          ["PMax | Emagrecimento", "Performance Max"],
          ["Search | Terapia Injetável", "Pesquisa"],
          ["Display | Remarketing", "Display"],
        ].map(([name, type], i) => {
          const c = cost * [0.19, 0.41, 0.28, 0.12][i];
          const cv = Math.round(conversions * [0.24, 0.39, 0.29, 0.08][i]);
          return {
            name,
            type,
            cost: Math.round(c * 100) / 100,
            conversions: cv,
            cpa: Math.round(safeDiv(c, cv) * 100) / 100,
          };
        }),
      },
    ],
    notices: [],
  };
}

/* ----------------------------------------------------------------- GA4 */

export function mockGa4(range: DateRange, fetchedAt = NOW): ChannelReport {
  const days = eachDay(range);
  const series: SeriesPoint[] = days.map((date) => {
    const sessions = dailyValue("ga4:sessions", date, 3_100);
    const users = sessions * (0.72 + noise(`ga4:u:${date}`) * 0.08);
    const conversions = dailyValue("ga4:conv", date, 52);
    return {
      date,
      sessions: Math.round(sessions),
      users: Math.round(users),
      conversions: Math.round(conversions),
      engagementRate: 0.52 + noise(`ga4:er:${date}`) * 0.16,
      avgDuration: 95 + noise(`ga4:dur:${date}`) * 70,
    };
  });

  const sessions = sum(series, "sessions");
  const users = sum(series, "users");
  const conversions = sum(series, "conversions");

  return {
    channel: "ga4",
    label: "Google Analytics",
    source: "mock",
    range,
    fetchedAt,
    kpis: [
      {
        key: "sessions",
        label: "Sessões",
        value: sessions,
        previousValue: sessions * 0.88,
        format: "integer",
      },
      {
        key: "users",
        label: "Usuários",
        value: users,
        previousValue: users * 0.9,
        format: "integer",
      },
      {
        key: "conversions",
        label: "Conversões",
        value: conversions,
        previousValue: conversions * 0.81,
        format: "integer",
      },
      {
        key: "conversionRate",
        label: "Taxa de conversão",
        value: safeDiv(conversions, sessions),
        previousValue: safeDiv(conversions * 0.81, sessions * 0.88),
        format: "percent",
      },
      {
        key: "avgDuration",
        label: "Duração média",
        value: series.reduce((a, p) => a + Number(p.avgDuration), 0) / Math.max(1, series.length),
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
        rows: [
          "Paid Social",
          "Paid Search",
          "Organic Search",
          "Direct",
          "Organic Social",
          "Referral",
        ].map((channel, i) => {
          const s = Math.round(sessions * [0.31, 0.24, 0.18, 0.13, 0.09, 0.05][i]);
          const c = Math.round(conversions * [0.34, 0.29, 0.14, 0.12, 0.08, 0.03][i]);
          return { channel, sessions: s, conversions: c, rate: safeDiv(c, s) };
        }),
      },
      {
        title: "Páginas mais vistas",
        columns: [
          { key: "page", label: "Página", align: "left" },
          { key: "views", label: "Visualizações", format: "integer", align: "right" },
          { key: "avgDuration", label: "Tempo médio", format: "duration", align: "right" },
        ],
        rows: ["/", "/planos", "/terapia-injetavel", "/agendar", "/sobre"].map((page, i) => ({
          page,
          views: Math.round(sessions * [0.42, 0.21, 0.16, 0.13, 0.08][i]),
          avgDuration: 60 + noise(`ga4:pg:${i}`) * 180,
        })),
      },
    ],
    notices: [],
  };
}

/* ------------------------------------------------------------- Orgânico */

export function mockOrganico(range: DateRange, fetchedAt = NOW): ChannelReport {
  const days = eachDay(range);
  const series: SeriesPoint[] = days.map((date) => {
    const reach = dailyValue("org:reach", date, 9_400);
    const engagement = dailyValue("org:eng", date, 610);
    const followers = dailyValue("org:fol", date, 28, { amplitude: 0.5 });
    return {
      date,
      reach: Math.round(reach),
      engagement: Math.round(engagement),
      followerGrowth: Math.round(followers),
      engagementRate: safeDiv(engagement, reach),
    };
  });

  const reach = sum(series, "reach");
  const engagement = sum(series, "engagement");
  const followerGrowth = sum(series, "followerGrowth");

  return {
    channel: "organico",
    label: "Orgânico",
    source: "mock",
    range,
    fetchedAt,
    kpis: [
      {
        key: "reach",
        label: "Alcance",
        value: reach,
        previousValue: reach * 0.79,
        format: "integer",
      },
      {
        key: "engagement",
        label: "Interações",
        value: engagement,
        previousValue: engagement * 0.86,
        format: "integer",
      },
      {
        key: "engagementRate",
        label: "Taxa de engajamento",
        value: safeDiv(engagement, reach),
        previousValue: safeDiv(engagement * 0.86, reach * 0.79),
        format: "percent",
      },
      {
        key: "followerGrowth",
        label: "Novos seguidores",
        value: followerGrowth,
        previousValue: followerGrowth * 1.12,
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
        description: "Instagram e Facebook, ordenadas por interações.",
        columns: [
          { key: "post", label: "Publicação", align: "left" },
          { key: "rede", label: "Rede", align: "left" },
          { key: "reach", label: "Alcance", format: "integer", align: "right" },
          { key: "engagement", label: "Interações", format: "integer", align: "right" },
          { key: "rate", label: "Engajamento", format: "percent", align: "right" },
        ],
        rows: [
          ["Reels | Como funciona a terapia injetável", "Instagram"],
          ["Carrossel | 5 mitos sobre emagrecimento", "Instagram"],
          ["Reels | Bastidores da consulta", "Instagram"],
          ["Post | Depoimento de paciente", "Facebook"],
          ["Carrossel | Checklist do check-up", "Instagram"],
        ].map(([post, rede], i) => {
          const r = Math.round(reach * [0.14, 0.11, 0.09, 0.06, 0.05][i]);
          const e = Math.round(engagement * [0.19, 0.15, 0.12, 0.05, 0.07][i]);
          return { post, rede, reach: r, engagement: e, rate: safeDiv(e, r) };
        }),
      },
    ],
    notices: [],
  };
}
