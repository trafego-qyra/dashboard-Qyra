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
    // A campanha soma os dois tipos de lead reconhecidos.
    expect(report.tables[0].rows[0].leads).toBe(15);
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
    expect(report.notices[0]).toMatch(/Sem credencial/);
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
      if (url.includes("/insights")) {
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
    expect(report.notices[0]).toMatch(/publicações/);
  });
});
