/**
 * Relatórios fictícios por canal, no mesmo contrato dos conectores reais.
 *
 * Servem para (a) rodar o dashboard sem credencial, (b) fixture dos testes e
 * (c) storybook visual de estados. Números calibrados para uma operação de
 * tráfego de porte médio — o objetivo é UI realista, não previsão.
 */
import { ordenarCriativos } from "@/lib/criativos";
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

/**
 * Arte de demonstração como SVG embutido.
 *
 * A CSP do painel só libera `img-src 'self' data: blob:`, e nenhum dado de
 * demonstração deve depender de rede para renderizar — o modo mock precisa
 * funcionar offline, que é metade da razão de ele existir.
 */
function arteDeDemonstracao(indice: number): string {
  const paletas = [
    ["#2f2535", "#9d5cc1"],
    ["#4e9e76", "#789180"],
    ["#9d5cc1", "#d7d2e1"],
    ["#c96a24", "#2f2535"],
    ["#4a79d1", "#9d5cc1"],
  ];
  const [fundo, brilho] = paletas[indice % paletas.length];
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">` +
    `<defs><radialGradient id="g" cx="30%" cy="25%" r="85%">` +
    `<stop offset="0%" stop-color="${brilho}"/>` +
    `<stop offset="100%" stop-color="${fundo}"/>` +
    `</radialGradient></defs>` +
    `<rect width="400" height="400" fill="url(#g)"/>` +
    `<text x="200" y="216" text-anchor="middle" font-family="sans-serif" ` +
    `font-size="34" font-weight="600" fill="#ffffff" opacity="0.62">Criativo</text>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/* ------------------------------------------------------------------ Meta Ads */

export function mockMetaAds(range: DateRange, fetchedAt = NOW): ChannelReport {
  const days = eachDay(range);
  const series: SeriesPoint[] = days.map((date) => {
    const spend = dailyValue("meta:spend", date, 640);
    const impressions = dailyValue("meta:impr", date, 78_000);
    const clicks = dailyValue("meta:clicks", date, 1_240);
    const linkClicks = dailyValue("meta:linkclicks", date, 520);
    const leads = dailyValue("meta:leads", date, 34);
    return {
      date,
      spend: Math.round(spend * 100) / 100,
      impressions: Math.round(impressions),
      clicks: Math.round(clicks),
      linkClicks: Math.round(linkClicks),
      leads: Math.round(leads),
      ctr: safeDiv(clicks, impressions),
      cpm: safeDiv(spend, impressions) * 1000,
      cpl: safeDiv(spend, Math.max(1, Math.round(leads))),
    };
  });

  const spend = sum(series, "spend");
  const clicks = sum(series, "clicks");
  const linkClicks = sum(series, "linkClicks");
  const impressions = sum(series, "impressions");
  const leads = sum(series, "leads");
  // Frequência ~2,4: alcance é uma fração das impressões, não a soma dos dias.
  const reach = Math.round(impressions / 2.4);

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
        key: "impressions",
        label: "Impressões",
        value: impressions,
        previousValue: impressions * 0.88,
        format: "integer",
      },
      {
        key: "reach",
        label: "Alcance",
        value: reach,
        previousValue: reach * 0.9,
        format: "integer",
        hint: "Pessoas distintas que viram os anúncios.",
      },
      {
        key: "cpm",
        label: "CPM",
        value: safeDiv(spend, impressions) * 1000,
        previousValue: safeDiv(spend * 0.91, impressions * 0.88) * 1000,
        format: "currency",
        lowerIsBetter: true,
        hint: "Custo por mil impressões, calculado sobre o total do período.",
      },
      {
        key: "ctr",
        label: "CTR",
        value: safeDiv(clicks, impressions),
        previousValue: safeDiv(clicks, impressions) * 0.96,
        format: "percent",
      },
      {
        key: "frequency",
        label: "Frequência",
        value: safeDiv(impressions, reach),
        previousValue: safeDiv(impressions, reach) * 0.94,
        format: "decimal",
        lowerIsBetter: true,
        hint: "Quantas vezes, em média, cada pessoa alcançada viu um anúncio.",
      },
      {
        key: "linkClicks",
        label: "Cliques no link",
        value: linkClicks,
        previousValue: linkClicks * 0.93,
        format: "integer",
        hint: "Só cliques que levaram ao destino.",
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
    ],
    series,
    seriesDefs: [
      { key: "spend", label: "Investimento", format: "currency", slot: 1 },
      { key: "leads", label: "Leads", format: "integer", slot: 2 },
      { key: "impressions", label: "Impressões", format: "integer", slot: 3 },
      { key: "cpm", label: "CPM", format: "currency", slot: 4 },
    ],
    // A arte da demonstração é um SVG embutido: a CSP libera `data:`, e nenhum
    // dado de demonstração deve depender de rede para renderizar.
    creatives: ordenarCriativos(
      [
        ["Vídeo 15s | Antes e depois", "Reconhecimento | Marca | Vídeo 15s", 0.09, 0.05, true],
        ["Carrossel | Protocolo completo", "Conversão | Emagrecimento | Broad", 0.34, 0.38, false],
        [
          "Vídeo 30s | Depoimento médica",
          "Conversão | Terapia Injetável | Lookalike 1%",
          0.26,
          0.29,
          true,
        ],
        [
          "Estático | Consulta em 24h",
          "Conversão | Check-up | Interesses saúde",
          0.14,
          0.16,
          false,
        ],
        ["Reels | Rotina do tratamento", "Tráfego | Institucional | Retargeting", 0.17, 0.12, true],
      ].map(([nome, campanha, fatiaSpend, fatiaLeads, ehVideo], i) => {
        const s = spend * (fatiaSpend as number);
        // A fatia de impressões não pode ser a mesma do investimento: com as
        // duas iguais o CPM sai idêntico em todo criativo e a coluna parece
        // quebrada.
        const impr = Math.round(
          impressions * (fatiaSpend as number) * (0.66 + noise(`impr-${i}`) * 0.5),
        );
        const l = Math.round(leads * (fatiaLeads as number));
        const reproducoes = Math.round(impr * 0.31);
        return {
          id: `mock-${i}`,
          name: nome as string,
          campaign: campanha as string,
          imageUrl: arteDeDemonstracao(i),
          spend: Math.round(s * 100) / 100,
          impressions: impr,
          ctr: 0.006 + noise(`meta-ctr-criativo-${i}`) * 0.038,
          cpm: Math.round(safeDiv(s, impr) * 1000 * 100) / 100,
          leads: l,
          cpl: Math.round(safeDiv(s, l) * 100) / 100,
          video: ehVideo
            ? {
                reproducoes,
                p25: 0.38 + noise(`v25-${i}`) * 0.22,
                p50: 0.2 + noise(`v50-${i}`) * 0.16,
                p75: 0.12 + noise(`v75-${i}`) * 0.1,
                p100: 0.06 + noise(`v100-${i}`) * 0.09,
              }
            : undefined,
        };
      }),
    ),
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
        rows: [
          "Conversão | Emagrecimento | Broad",
          "Conversão | Terapia Injetável | Lookalike 1%",
          "Tráfego | Institucional | Retargeting",
          "Conversão | Check-up | Interesses saúde",
          "Reconhecimento | Marca | Vídeo 15s",
        ].map((name, i) => {
          const fatia = [0.34, 0.26, 0.17, 0.14, 0.09][i];
          const s = spend * fatia;
          // A fatia de impressões difere da de investimento de propósito: com a
          // mesma fatia nos dois, o CPM sai idêntico em toda campanha e a
          // coluna parece quebrada.
          const impr = Math.round(impressions * [0.29, 0.24, 0.22, 0.13, 0.12][i]);
          const l = Math.round(leads * [0.38, 0.29, 0.12, 0.16, 0.05][i]);
          return {
            name,
            spend: Math.round(s * 100) / 100,
            impressions: impr,
            cpm: Math.round(safeDiv(s, impr) * 1000 * 100) / 100,
            ctr: 0.009 + noise(`meta-ctr-campanha-${i}-${name.length}`) * 0.026,
            linkClicks: Math.round(linkClicks * fatia),
            leads: l,
            cpl: Math.round(safeDiv(s, l) * 100) / 100,
          };
        }),
      },
      {
        title: "Retenção de vídeo",
        description:
          "Quantas pessoas seguiram assistindo até cada marca. A porcentagem é sobre quem começou a assistir, que é a base usada pela própria Meta.",
        columns: [
          { key: "etapa", label: "Etapa", align: "left" },
          { key: "pessoas", label: "Pessoas", format: "integer", align: "right" },
          { key: "retencao", label: "% de quem começou", format: "percent", align: "right" },
        ],
        rows: (() => {
          const reproducoes = Math.round(impressions * 0.31);
          return [
            ["Começou a assistir", 1],
            ["Assistiu 25%", 0.47],
            ["Assistiu 50%", 0.28],
            ["Assistiu 75%", 0.19],
            ["Assistiu até o fim", 0.13],
          ].map(([etapa, fator]) => ({
            etapa: etapa as string,
            pessoas: Math.round(reproducoes * (fator as number)),
            retencao: fator as number,
          }));
        })(),
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
        title: "Origem das visitas",
        description:
          "De onde a sessão veio, pela UTM do link. É aqui que se vê qual post de Instagram ou LinkedIn trouxe gente — o agrupamento acima junta tudo num balde só.",
        columns: [
          { key: "origem", label: "Origem / mídia", align: "left" },
          { key: "campanha", label: "Campanha", align: "left" },
          { key: "sessions", label: "Sessões", format: "integer", align: "right" },
          { key: "conversions", label: "Conversões", format: "integer", align: "right" },
          { key: "rate", label: "Taxa de conversão", format: "percent", align: "right" },
        ],
        rows: [
          ["instagram / social", "bio-agosto", 0.14, 0.16],
          ["instagram / social", "post-emagrecimento-12ago", 0.11, 0.13],
          ["facebook / cpc", "conversao-broad", 0.19, 0.22],
          ["linkedin / social", "artigo-terapia-injetavel", 0.08, 0.09],
          ["google / cpc", "search-intencao", 0.16, 0.18],
          ["google / organic", "não informado", 0.13, 0.07],
          ["linkedin / social", "vaga-institucional", 0.04, 0.02],
          ["direto / sem mídia", "não informado", 0.15, 0.13],
        ].map(([origem, campanha, fs, fc]) => {
          const se = Math.round(sessions * (fs as number));
          const co = Math.round(conversions * (fc as number));
          return {
            origem: origem as string,
            campanha: campanha as string,
            sessions: se,
            conversions: co,
            rate: safeDiv(co, se),
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
