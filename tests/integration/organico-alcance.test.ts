import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Alcance do orgânico.
 *
 * Alcance conta pessoas distintas. Somar o valor diário conta de novo quem
 * voltou — num mês o número infla várias vezes, e a taxa de engajamento afunda
 * junto porque o alcance é o denominador.
 */

const CREDENCIAIS = {
  META_ACCESS_TOKEN: "token",
  META_AD_ACCOUNT_ID: "123",
  META_PAGE_ID: "999",
  META_IG_USER_ID: "888",
};

/** 3 dias, 100 de alcance cada, mas só 120 pessoas distintas no total. */
function grafo({ comTotalValue }: { comTotalValue: boolean }) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();

    if (url.includes("metric_type=total_value")) {
      if (!comTotalValue) {
        return new Response(JSON.stringify({ error: { message: "unsupported metric" } }), {
          status: 400,
          statusText: "Bad Request",
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({ data: [{ name: "reach", total_value: { value: 120 } }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    if (url.includes("/insights")) {
      return new Response(
        JSON.stringify({
          data: [
            {
              name: "reach",
              period: "day",
              values: [
                { value: 100, end_time: "2026-02-02T07:00:00+0000" },
                { value: 100, end_time: "2026-02-03T07:00:00+0000" },
                { value: 100, end_time: "2026-02-04T07:00:00+0000" },
              ],
            },
            { name: "follower_count", period: "day", values: [] },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
}

async function relatorio() {
  const { fetchOrganicoReport } = await import("@/server/connectors/organico");
  return fetchOrganicoReport({ from: "2026-02-01", to: "2026-02-03" });
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.stubEnv("QYRA_FORCE_MOCK", "false");
  for (const [k, v] of Object.entries(CREDENCIAIS)) vi.stubEnv(k, v);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("alcance do orgânico", () => {
  it("usa o valor deduplicado da Meta, não a soma dos dias", async () => {
    vi.stubGlobal("fetch", grafo({ comTotalValue: true }));
    const report = await relatorio();

    // Soma diária daria 300. Pessoas distintas são 120.
    expect(report.kpis.find((k) => k.key === "reach")?.value).toBe(120);
  });

  it("a taxa de engajamento usa o alcance deduplicado como base", async () => {
    vi.stubGlobal("fetch", grafo({ comTotalValue: true }));
    const report = await relatorio();

    const alcance = report.kpis.find((k) => k.key === "reach")?.value ?? 0;
    const interacoes = report.kpis.find((k) => k.key === "engagement")?.value ?? 0;
    const taxa = report.kpis.find((k) => k.key === "engagementRate")?.value ?? 0;

    // Com o alcance inflado o denominador cresce e a taxa afunda sem motivo.
    expect(taxa).toBeCloseTo(alcance === 0 ? 0 : interacoes / alcance, 6);
  });

  it("sem a métrica deduplicada, soma os dias mas avisa na dica", async () => {
    vi.stubGlobal("fetch", grafo({ comTotalValue: false }));
    const report = await relatorio();
    const kpi = report.kpis.find((k) => k.key === "reach");

    expect(kpi?.value).toBe(300);
    // Número inflado sem aviso é pior que número inflado com aviso.
    expect(kpi?.hint).toMatch(/uma vez por dia/i);
  });

  it("não põe o token na URL", async () => {
    const espiao = grafo({ comTotalValue: true });
    vi.stubGlobal("fetch", espiao);
    await relatorio();

    // A Graph ecoa a requisição na mensagem de erro, e query string vai
    // parar em log de plataforma.
    for (const chamada of espiao.mock.calls) {
      const url = String(chamada[0]);
      expect(url).not.toContain("access_token");
    }
  });
});
