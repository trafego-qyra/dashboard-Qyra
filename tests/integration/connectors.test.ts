import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Conectores no caminho "live".
 *
 * Aqui mora o risco real do produto: se a conversão de micros, a contagem de
 * leads ou o preenchimento de dias sem entrega estiver errada, o cliente recebe
 * número errado e ninguém percebe. O `fetch` é substituído por respostas
 * fixas com o mesmo formato das APIs de origem.
 */

const RANGE = { from: "2026-02-01", to: "2026-02-03" };

/** Configura credenciais e recarrega os módulos, que leem env na importação. */
async function withCredentials(vars: Record<string, string>) {
  vi.resetModules();
  vi.stubEnv("QYRA_FORCE_MOCK", "false");
  for (const [key, value] of Object.entries(vars)) vi.stubEnv(key, value);
}

function mockFetch(handler: (url: string, init?: RequestInit) => unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      return new Response(JSON.stringify(handler(url, init)), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

const GOOGLE_OAUTH = {
  GOOGLE_CLIENT_ID: "cid",
  GOOGLE_CLIENT_SECRET: "secret",
  GOOGLE_REFRESH_TOKEN: "refresh",
};

const TOKEN_RESPONSE = { access_token: "tok", expires_in: 3600, token_type: "Bearer" };

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("Meta Ads", () => {
  it("soma leads apenas dos tipos de ação configurados", async () => {
    await withCredentials({ META_ACCESS_TOKEN: "t", META_AD_ACCOUNT_ID: "123" });
    mockFetch((url) =>
      url.includes("level=campaign")
        ? {
            data: [
              {
                date_start: "2026-02-01",
                campaign_name: "Conversão | Broad",
                spend: "300.00",
                impressions: "10000",
                clicks: "200",
                actions: [
                  { action_type: "lead", value: "10" },
                  { action_type: "link_click", value: "180" },
                  { action_type: "offsite_conversion.fb_pixel_lead", value: "5" },
                ],
              },
            ],
          }
        : {
            data: [
              {
                date_start: "2026-02-01",
                spend: "100.00",
                impressions: "5000",
                clicks: "100",
                actions: [
                  { action_type: "lead", value: "8" },
                  { action_type: "post_engagement", value: "400" },
                ],
              },
              {
                date_start: "2026-02-03",
                spend: "50.00",
                impressions: "2500",
                clicks: "40",
                actions: [{ action_type: "lead", value: "2" }],
              },
            ],
          },
    );

    const { fetchMetaAdsReport } = await import("@/server/connectors/meta-ads");
    const report = await fetchMetaAdsReport(RANGE);

    expect(report.source).toBe("live");
    // `post_engagement` e `link_click` não são lead.
    expect(report.kpis.find((k) => k.key === "leads")?.value).toBe(10);
    expect(report.kpis.find((k) => k.key === "spend")?.value).toBe(150);
    // 150 / 10
    expect(report.kpis.find((k) => k.key === "cpl")?.value).toBe(15);
    // A campanha traz o agregado `lead: 10` e o detalhado
    // `offsite_conversion.fb_pixel_lead: 5`. O agregado JÁ CONTÉM o detalhado —
    // somar os dois dobraria o número e cortaria o CPL pela metade.
    expect(report.tables[0].rows[0].leads).toBe(10);
  });

  it("soma os tipos detalhados quando a Meta não devolve o agregado", async () => {
    await withCredentials({ META_ACCESS_TOKEN: "t", META_AD_ACCOUNT_ID: "123" });
    mockFetch(() => ({
      data: [
        {
          date_start: "2026-02-01",
          spend: "100.00",
          actions: [
            { action_type: "offsite_conversion.fb_pixel_lead", value: "6" },
            { action_type: "onsite_conversion.lead_grouped", value: "4" },
            { action_type: "link_click", value: "300" },
          ],
        },
      ],
    }));

    const { fetchMetaAdsReport } = await import("@/server/connectors/meta-ads");
    const report = await fetchMetaAdsReport(RANGE);

    // Sem o agregado, os detalhados são somados entre si — e só eles.
    expect(report.kpis.find((k) => k.key === "leads")?.value).toBe(10);
  });

  it("calcula CPM, frequência e cliques no link a partir dos totais", async () => {
    await withCredentials({ META_ACCESS_TOKEN: "t", META_AD_ACCOUNT_ID: "123" });
    mockFetch((url) =>
      url.includes("level=campaign")
        ? {
            data: [
              {
                date_start: "2026-02-01",
                campaign_name: "Conversão | Teste",
                spend: "300.00",
                impressions: "100000",
                reach: "40000",
                clicks: "900",
                inline_link_clicks: "500",
              },
            ],
          }
        : {
            data: [
              {
                date_start: "2026-02-01",
                spend: "300.00",
                impressions: "100000",
                clicks: "900",
                inline_link_clicks: "500",
              },
            ],
          },
    );

    const { fetchMetaAdsReport } = await import("@/server/connectors/meta-ads");
    const report = await fetchMetaAdsReport(RANGE);
    const kpi = (key: string) => report.kpis.find((k) => k.key === key)?.value;

    // CPM sobre o total, não média das médias diárias: 300 / 100000 * 1000.
    expect(kpi("cpm")).toBeCloseTo(3, 5);
    // Frequência é impressões por pessoa alcançada: 100000 / 40000.
    expect(kpi("frequency")).toBeCloseTo(2.5, 5);
    // Cliques no link não é o total de cliques — o total inclui curtida e afins.
    expect(kpi("linkClicks")).toBe(500);
    expect(kpi("clicks" as string) ?? 900).not.toBe(kpi("linkClicks"));
    expect(kpi("reach")).toBe(40000);
  });

  it("não expõe identificador cru da API na tela", async () => {
    await withCredentials({ META_ACCESS_TOKEN: "t", META_AD_ACCOUNT_ID: "123" });
    mockFetch(() => ({
      data: [
        {
          date_start: "2026-02-01",
          spend: "100.00",
          impressions: "1000",
          actions: [
            { action_type: "lead", value: "10" },
            { action_type: "onsite_conversion.post_net_like", value: "339" },
          ],
        },
      ],
    }));

    const { fetchMetaAdsReport } = await import("@/server/connectors/meta-ads");
    const report = await fetchMetaAdsReport(RANGE);

    // `onsite_conversion.post_net_like` e afins são nomes internos da Meta.
    // Já foram parar na tela de cliente uma vez; não podem voltar.
    const tudo = JSON.stringify(report.tables);
    expect(tudo).not.toMatch(/onsite_conversion|post_interaction|omni_/);
  });

  it("mostra retenção de vídeo, e só quando há vídeo", async () => {
    await withCredentials({ META_ACCESS_TOKEN: "t", META_AD_ACCOUNT_ID: "123" });
    mockFetch((url) =>
      url.includes("level=campaign")
        ? {
            data: [
              {
                date_start: "2026-02-01",
                campaign_name: "Vídeo | Teste",
                spend: "100.00",
                impressions: "1000",
                video_play_actions: [{ action_type: "video_view", value: "800" }],
                video_p25_watched_actions: [{ action_type: "video_view", value: "400" }],
                video_p50_watched_actions: [{ action_type: "video_view", value: "200" }],
                video_p75_watched_actions: [{ action_type: "video_view", value: "100" }],
                video_p100_watched_actions: [{ action_type: "video_view", value: "40" }],
              },
            ],
          }
        : { data: [{ date_start: "2026-02-01", spend: "100.00", impressions: "1000" }] },
    );

    const { fetchMetaAdsReport } = await import("@/server/connectors/meta-ads");
    const report = await fetchMetaAdsReport(RANGE);
    const video = report.tables.find((t) => t.title === "Retenção de vídeo");

    expect(video).toBeDefined();
    // A porcentagem é sobre quem começou, que é a base da própria Meta.
    expect(video?.rows.find((r) => r.etapa === "Assistiu 50%")?.retencao).toBeCloseTo(0.25, 5);
    expect(video?.rows.find((r) => r.etapa === "Assistiu até o fim")?.retencao).toBeCloseTo(
      0.05,
      5,
    );
  });

  it("omite a tabela de vídeo quando a conta não tem vídeo", async () => {
    await withCredentials({ META_ACCESS_TOKEN: "t", META_AD_ACCOUNT_ID: "123" });
    mockFetch(() => ({
      data: [{ date_start: "2026-02-01", spend: "100.00", impressions: "1000" }],
    }));

    const { fetchMetaAdsReport } = await import("@/server/connectors/meta-ads");
    const report = await fetchMetaAdsReport(RANGE);

    // Tabela de zeros ocupa espaço e sugere campanha ruim, quando nem é de vídeo.
    expect(report.tables.find((t) => t.title === "Retenção de vídeo")).toBeUndefined();
  });

  it("preenche com zero os dias sem entrega, para o eixo não pular", async () => {
    await withCredentials({ META_ACCESS_TOKEN: "t", META_AD_ACCOUNT_ID: "act_123" });
    mockFetch(() => ({
      data: [{ date_start: "2026-02-02", spend: "10", clicks: "1", impressions: "10" }],
    }));

    const { fetchMetaAdsReport } = await import("@/server/connectors/meta-ads");
    const report = await fetchMetaAdsReport(RANGE);

    expect(report.series.map((p) => p.date)).toEqual(["2026-02-01", "2026-02-02", "2026-02-03"]);
    expect(report.series[0].spend).toBe(0);
    expect(report.series[1].spend).toBe(10);
  });

  it("cai para demonstração — e avisa — quando falta credencial", async () => {
    vi.resetModules();
    vi.stubEnv("QYRA_FORCE_MOCK", "false");
    vi.stubEnv("META_ACCESS_TOKEN", "");
    vi.stubEnv("META_AD_ACCOUNT_ID", "");

    const { fetchMetaAdsReport } = await import("@/server/connectors/meta-ads");
    const report = await fetchMetaAdsReport(RANGE);

    expect(report.source).toBe("mock");
    expect(report.notices[0].text).toMatch(/Sem credencial/);
  });
});

describe("Google Ads", () => {
  it("converte micros em reais e agrega campanha repetida por dia", async () => {
    await withCredentials({
      ...GOOGLE_OAUTH,
      GOOGLE_ADS_DEVELOPER_TOKEN: "dev",
      GOOGLE_ADS_CUSTOMER_ID: "123-456-7890",
    });

    mockFetch((url) => {
      if (url.includes("oauth2.googleapis.com")) return TOKEN_RESPONSE;
      if (url.includes("searchStream")) {
        return [
          {
            results: [
              {
                segments: { date: "2026-02-01" },
                campaign: { name: "Search | Marca", advertisingChannelType: "SEARCH" },
                metrics: {
                  costMicros: "1500000",
                  impressions: "100",
                  clicks: "10",
                  conversions: 2,
                },
              },
              {
                segments: { date: "2026-02-02" },
                campaign: { name: "Search | Marca", advertisingChannelType: "SEARCH" },
                metrics: { costMicros: "500000", impressions: "50", clicks: "5", conversions: 1 },
              },
            ],
          },
        ];
      }
      return {};
    });

    const { fetchGoogleAdsReport } = await import("@/server/connectors/google-ads");
    const report = await fetchGoogleAdsReport(RANGE);

    // 2.000.000 micros = R$ 2,00
    expect(report.kpis.find((k) => k.key === "cost")?.value).toBe(2);
    expect(report.kpis.find((k) => k.key === "conversions")?.value).toBe(3);
    // As duas linhas da mesma campanha viram uma só na tabela.
    expect(report.tables[0].rows).toHaveLength(1);
    expect(report.tables[0].rows[0].cost).toBe(2);
  });

  it("envia developer-token e login-customer-id sem hífen", async () => {
    await withCredentials({
      ...GOOGLE_OAUTH,
      GOOGLE_ADS_DEVELOPER_TOKEN: "dev",
      GOOGLE_ADS_CUSTOMER_ID: "123-456-7890",
      GOOGLE_ADS_LOGIN_CUSTOMER_ID: "999-888-7777",
    });

    const seen: Array<{ url: string; init?: RequestInit }> = [];
    mockFetch((url, init) => {
      seen.push({ url, init });
      if (url.includes("oauth2.googleapis.com")) return TOKEN_RESPONSE;
      return [{ results: [] }];
    });

    const { fetchGoogleAdsReport } = await import("@/server/connectors/google-ads");
    await fetchGoogleAdsReport(RANGE);

    const call = seen.find((c) => c.url.includes("searchStream"));
    const headers = call?.init?.headers as Record<string, string>;
    expect(call?.url).toContain("/customers/1234567890/");
    expect(headers["developer-token"]).toBe("dev");
    expect(headers["login-customer-id"]).toBe("9998887777");
  });
});

describe("GA4", () => {
  it("converte a data compacta e não divide por zero", async () => {
    await withCredentials({ ...GOOGLE_OAUTH, GA4_PROPERTY_ID: "999" });

    mockFetch((url) => {
      if (url.includes("oauth2.googleapis.com")) return TOKEN_RESPONSE;
      if (url.includes("runReport")) {
        return {
          rows: [
            {
              dimensionValues: [{ value: "20260202" }],
              metricValues: [
                { value: "1000" },
                { value: "800" },
                { value: "50" },
                { value: "0.61" },
                { value: "120" },
              ],
            },
          ],
        };
      }
      return {};
    });

    const { fetchGa4Report } = await import("@/server/connectors/ga4");
    const report = await fetchGa4Report(RANGE);

    expect(report.series.map((p) => p.date)).toEqual(["2026-02-01", "2026-02-02", "2026-02-03"]);
    expect(report.series[1].sessions).toBe(1000);
    expect(report.kpis.find((k) => k.key === "conversionRate")?.value).toBeCloseTo(0.05, 4);
    for (const kpi of report.kpis) expect(Number.isFinite(kpi.value)).toBe(true);
  });
});

describe("Orgânico", () => {
  it("quebra períodos longos em blocos de 30 dias", async () => {
    await withCredentials({ META_ACCESS_TOKEN: "t", META_IG_USER_ID: "ig1" });

    const insightCalls: string[] = [];
    mockFetch((url) => {
      // Só a consulta diária conta janela: a do alcance deduplicado
      // (`total_value`) acompanha os mesmos blocos e dobraria a contagem.
      if (url.includes("/insights") && !url.includes("metric_type=total_value")) {
        insightCalls.push(url);
        return { data: [{ name: "reach", period: "day", values: [] }] };
      }
      return { data: [] };
    });

    const { fetchOrganicoReport } = await import("@/server/connectors/organico");
    await fetchOrganicoReport({ from: "2026-01-01", to: "2026-03-01" });

    // 60 dias → exatamente 2 janelas de 30 (o limite da API de Insights).
    expect(insightCalls).toHaveLength(2);
    expect(insightCalls[0]).toContain("since=2026-01-01");
    expect(insightCalls[1]).toContain("since=2026-01-31");

    insightCalls.length = 0;
    await fetchOrganicoReport({ from: "2026-01-01", to: "2026-03-02" });
    // 61 dias já exigem uma terceira janela.
    expect(insightCalls).toHaveLength(3);
  });

  it("segue funcionando quando as publicações não carregam", async () => {
    await withCredentials({ META_ACCESS_TOKEN: "t", META_IG_USER_ID: "ig1" });

    mockFetch((url) => {
      if (url.includes("/media")) throw new Error("permissão ausente");
      return {
        data: [
          {
            name: "reach",
            period: "day",
            values: [{ value: 500, end_time: "2026-02-03T07:00:00+0000" }],
          },
        ],
      };
    });

    const { fetchOrganicoReport } = await import("@/server/connectors/organico");
    const report = await fetchOrganicoReport(RANGE);

    expect(report.source).toBe("live");
    expect(report.kpis.find((k) => k.key === "reach")?.value).toBe(500);
    expect(report.notices[0].text).toMatch(/publicações/);
  });
});

describe("Google Ads — quando a API recusa", () => {
  /**
   * Este canal teve, por meses, um export em CSV como piso: erro de API caía
   * nele em vez de derrubar a tela. Era certo enquanto o token da API aguardava
   * aprovação. Com o token liberado, o piso virou risco — número congelado
   * servido no lugar de dado atual, sem nada na tela dizendo qual dos dois se
   * está lendo.
   */
  it("propaga a falha em vez de servir outro número no lugar", async () => {
    await withCredentials({
      ...GOOGLE_OAUTH,
      GOOGLE_ADS_DEVELOPER_TOKEN: "dev",
      GOOGLE_ADS_CUSTOMER_ID: "123-456-7890",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("oauth2.googleapis.com")) {
          return new Response(JSON.stringify(TOKEN_RESPONSE), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ error: { message: "Customer not found" } }), {
          status: 404,
          statusText: "Not Found",
          headers: { "content-type": "application/json" },
        });
      }),
    );

    const { fetchGoogleAdsReport } = await import("@/server/connectors/google-ads");

    // A visão geral registra o erro e segue sem o canal; a tela do canal mostra
    // o que aconteceu. Nenhuma das duas mostra um número que não é o pedido.
    await expect(fetchGoogleAdsReport(RANGE)).rejects.toThrow(/404/);
  });

  it("sem credencial, cai em demonstração — como todo canal", async () => {
    await withCredentials({});

    const { fetchGoogleAdsReport } = await import("@/server/connectors/google-ads");
    const report = await fetchGoogleAdsReport(RANGE);

    expect(report.source).toBe("mock");
    expect(report.notices[0].text).toMatch(/demonstração/i);
  });

  it("não vaza segredo no erro que chega ao consolidado", async () => {
    await withCredentials({
      ...GOOGLE_OAUTH,
      GOOGLE_ADS_DEVELOPER_TOKEN: "dev",
      GOOGLE_ADS_CUSTOMER_ID: "123-456-7890",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("oauth2.googleapis.com")) {
          return new Response(JSON.stringify(TOKEN_RESPONSE), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        // A Google ecoa a requisição no erro, e a requisição leva credencial.
        return new Response(
          JSON.stringify({
            error: { message: "Bad request: developer-token=segredo-do-cliente" },
          }),
          {
            status: 400,
            statusText: "Bad Request",
            headers: { "content-type": "application/json" },
          },
        );
      }),
    );

    const { getAllReports } = await import("@/server/reports");
    const falha = (await getAllReports(RANGE)).find((r) => r.channel === "google-ads");

    // O erro do canal vira aviso de operação na visão geral. Sem redação nesse
    // caminho, o segredo apareceria numa tela.
    expect(falha?.error).toBeTruthy();
    expect(falha?.error).not.toMatch(/segredo-do-cliente/);
    expect(falha?.error).toMatch(/oculto/);
  });
});

describe("GA4 — origem das visitas por UTM", () => {
  it("pede a origem crua, não só o agrupamento padrão", async () => {
    await withCredentials({ ...GOOGLE_OAUTH, GA4_PROPERTY_ID: "123" });

    const corpos: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("oauth2.googleapis.com")) {
          return new Response(JSON.stringify(TOKEN_RESPONSE), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        corpos.push(String(init?.body ?? ""));
        return new Response(JSON.stringify({ rows: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    const { fetchGa4Report } = await import("@/server/connectors/ga4");
    await fetchGa4Report(RANGE);

    // `sessionDefaultChannelGroup` joga Instagram e LinkedIn no mesmo balde.
    // Sem estas três dimensões, a UTM que a equipe monta no post não aparece
    // em lugar nenhum do painel.
    const pedidos = corpos.join(" ");
    expect(pedidos).toContain("sessionSource");
    expect(pedidos).toContain("sessionMedium");
    expect(pedidos).toContain("sessionCampaignName");
    // `utm_content` é o que separa um post do outro dentro do mesmo tema, no
    // padrão de UTM em uso. Sem ele a tabela agrega o mês inteiro numa linha.
    expect(pedidos).toContain("sessionManualAdContent");
  });

  it("traduz os marcadores do GA4 em vez de mostrar (not set)", async () => {
    await withCredentials({ ...GOOGLE_OAUTH, GA4_PROPERTY_ID: "123" });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("oauth2.googleapis.com")) {
          return new Response(JSON.stringify(TOKEN_RESPONSE), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        const corpo = String(init?.body ?? "");
        if (!corpo.includes("sessionCampaignName")) {
          return new Response(JSON.stringify({ rows: [] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(
          JSON.stringify({
            rows: [
              {
                dimensionValues: [
                  { value: "instagram" },
                  { value: "social" },
                  { value: "institucional_ago" },
                  { value: "post_caneta" },
                ],
                metricValues: [{ value: "50" }, { value: "5" }],
              },
              {
                dimensionValues: [
                  { value: "(direct)" },
                  { value: "(none)" },
                  { value: "(not set)" },
                  { value: "(not set)" },
                ],
                metricValues: [{ value: "20" }, { value: "0" }],
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );

    const { fetchGa4Report } = await import("@/server/connectors/ga4");
    const report = await fetchGa4Report(RANGE);
    const tabela = report.tables.find((t) => t.title === "Origem das visitas");

    expect(tabela?.rows[0]).toMatchObject({
      origem: "instagram / social",
      campanha: "institucional_ago",
      conteudo: "post_caneta",
      sessions: 50,
      rate: 0.1,
    });
    // "(not set)" na tela do cliente parece defeito, não ausência de UTM.
    expect(JSON.stringify(tabela?.rows)).not.toMatch(/\(not set\)|\(direct\)|\(none\)/);
    expect(tabela?.rows[1]).toMatchObject({ origem: "direto / sem mídia" });
  });
});

describe("GA4 — duração média", () => {
  it("pondera pelo volume de cada dia, não é média das médias", async () => {
    await withCredentials({ ...GOOGLE_OAUTH, GA4_PROPERTY_ID: "123" });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("oauth2.googleapis.com")) {
          return new Response(JSON.stringify(TOKEN_RESPONSE), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        const corpo = String(init?.body ?? "");
        if (!corpo.includes('"date"')) {
          return new Response(JSON.stringify({ rows: [] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        // Um dia enorme com sessão curta, um dia minúsculo com sessão longa.
        return new Response(
          JSON.stringify({
            rows: [
              {
                dimensionValues: [{ value: "20260201" }],
                metricValues: [
                  { value: "100" },
                  { value: "90" },
                  { value: "0" },
                  { value: "0" },
                  { value: "10" },
                ],
              },
              {
                dimensionValues: [{ value: "20260202" }],
                metricValues: [
                  { value: "1" },
                  { value: "1" },
                  { value: "0" },
                  { value: "0" },
                  { value: "1000" },
                ],
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );

    const { fetchGa4Report } = await import("@/server/connectors/ga4");
    const report = await fetchGa4Report(RANGE);
    const duracao = report.kpis.find((k) => k.key === "avgDuration")?.value ?? 0;

    // Ponderado: (100x10 + 1x1000) / 101 = 19,8s.
    expect(duracao).toBeCloseTo(2000 / 101, 4);
    // Média das médias daria (10 + 1000) / 2 = 505s — vinte e cinco vezes
    // maior, e foi o que a tela mostrava antes.
    expect(duracao).toBeLessThan(100);
  });

  it("tempo por página vem de engajamento, não da duração da sessão", async () => {
    await withCredentials({ ...GOOGLE_OAUTH, GA4_PROPERTY_ID: "123" });

    const corpos: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("oauth2.googleapis.com")) {
          return new Response(JSON.stringify(TOKEN_RESPONSE), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        const corpo = String(init?.body ?? "");
        corpos.push(corpo);
        if (!corpo.includes("pageTitle")) {
          return new Response(JSON.stringify({ rows: [] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(
          JSON.stringify({
            rows: [
              {
                dimensionValues: [{ value: "Planos e preços" }, { value: "/planos" }],
                metricValues: [{ value: "200" }, { value: "9000" }],
              },
              {
                dimensionValues: [{ value: "" }, { value: "/sem-titulo" }],
                metricValues: [{ value: "10" }, { value: "300" }],
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );

    const { fetchGa4Report } = await import("@/server/connectors/ga4");
    const report = await fetchGa4Report(RANGE);
    const tabela = report.tables.find((t) => t.title === "Páginas mais vistas");

    // Métrica de sessão cruzada com página devolvia a duração da sessão
    // inteira, e o número não fechava com o indicador do topo.
    const pedidos = corpos.join(" ");
    expect(pedidos).toContain("userEngagementDuration");
    expect(pedidos).toContain("pageTitle");

    expect(tabela?.rows[0]).toMatchObject({
      page: "Planos e preços",
      path: "/planos",
      avgDuration: 45,
    });
    // Página sem título cai no endereço: melhor "/sem-titulo" do que vazio.
    expect(tabela?.rows[1]).toMatchObject({ page: "/sem-titulo" });
  });
});

describe("GA4 — usuários", () => {
  it("usa o total deduplicado do período, não a soma dos dias", async () => {
    await withCredentials({ ...GOOGLE_OAUTH, GA4_PROPERTY_ID: "123" });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("oauth2.googleapis.com")) {
          return new Response(JSON.stringify(TOKEN_RESPONSE), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        const corpo = String(init?.body ?? "");

        // A consulta sem dimensão é a que devolve o número deduplicado.
        if (!corpo.includes('"dimensions"')) {
          return new Response(JSON.stringify({ rows: [{ metricValues: [{ value: "120" }] }] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (!corpo.includes('"date"')) {
          return new Response(JSON.stringify({ rows: [] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        // Três dias com 100 usuários cada — em grande parte os mesmos.
        return new Response(
          JSON.stringify({
            rows: ["20260201", "20260202", "20260203"].map((d) => ({
              dimensionValues: [{ value: d }],
              metricValues: [
                { value: "150" },
                { value: "100" },
                { value: "0" },
                { value: "0" },
                { value: "60" },
              ],
            })),
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );

    const { fetchGa4Report } = await import("@/server/connectors/ga4");
    const report = await fetchGa4Report(RANGE);

    // Soma diária daria 300. Pessoas distintas são 120.
    expect(report.kpis.find((k) => k.key === "users")?.value).toBe(120);
    // Sessão é aditiva e continua somando: 150 x 3.
    expect(report.kpis.find((k) => k.key === "sessions")?.value).toBe(450);
  });

  it("sem o total deduplicado, cai na soma — inflado é melhor que zero", async () => {
    await withCredentials({ ...GOOGLE_OAUTH, GA4_PROPERTY_ID: "123" });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("oauth2.googleapis.com")) {
          return new Response(JSON.stringify(TOKEN_RESPONSE), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        const corpo = String(init?.body ?? "");
        if (!corpo.includes('"dimensions"')) {
          return new Response(JSON.stringify({ rows: [] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (!corpo.includes('"date"')) {
          return new Response(JSON.stringify({ rows: [] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(
          JSON.stringify({
            rows: [
              {
                dimensionValues: [{ value: "20260201" }],
                metricValues: [
                  { value: "10" },
                  { value: "7" },
                  { value: "0" },
                  { value: "0" },
                  { value: "0" },
                ],
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );

    const { fetchGa4Report } = await import("@/server/connectors/ga4");
    const report = await fetchGa4Report(RANGE);

    expect(report.kpis.find((k) => k.key === "users")?.value).toBe(7);
  });
});
