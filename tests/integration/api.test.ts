import { beforeEach, describe, expect, it } from "vitest";

import { GET as healthGet } from "@/app/api/health/route";
import { GET as overviewGet } from "@/app/api/v1/overview/route";
import { GET as reportGet } from "@/app/api/v1/reports/[channel]/route";
import { resetRateLimit } from "@/server/lib/rate-limit";

/**
 * As rotas são a fronteira pública do backend: contrato, validação de entrada,
 * rate limit e vazamento de detalhe interno são testados aqui.
 */

function request(url: string, ip = "203.0.113.1") {
  return new Request(url, { headers: { "x-forwarded-for": ip } });
}

describe("GET /api/health", () => {
  it("reporta prontidão sem expor segredo", async () => {
    const body = await (await healthGet()).json();

    expect(body.status).toBe("ok");
    expect(Object.values(body.integrations).every((v) => typeof v === "boolean")).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/token|secret|refresh/i);
  });
});

describe("GET /api/v1/reports/:channel", () => {
  beforeEach(resetRateLimit);

  it("devolve o relatório do canal", async () => {
    const response = await reportGet(
      request("https://qyra.test/api/v1/reports/meta-ads?preset=7d"),
      {
        params: Promise.resolve({ channel: "meta-ads" }),
      },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.channel).toBe("meta-ads");
    expect(body.series).toHaveLength(7);
  });

  it("recusa canal inexistente com 404", async () => {
    const response = await reportGet(request("https://qyra.test/api/v1/reports/tiktok"), {
      params: Promise.resolve({ channel: "tiktok" }),
    });

    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("unknown_channel");
  });

  it("cai no preset padrão diante de intervalo inválido", async () => {
    const response = await reportGet(
      request("https://qyra.test/api/v1/reports/ga4?from=amanha&to=ontem"),
      { params: Promise.resolve({ channel: "ga4" }) },
    );

    expect(response.status).toBe(200);
    expect((await response.json()).series).toHaveLength(28);
  });

  it("publica os cabeçalhos de rate limit", async () => {
    const response = await reportGet(request("https://qyra.test/api/v1/reports/ga4"), {
      params: Promise.resolve({ channel: "ga4" }),
    });

    expect(response.headers.get("x-ratelimit-limit")).toBeTruthy();
    expect(Number(response.headers.get("x-ratelimit-remaining"))).toBeGreaterThanOrEqual(0);
  });

  it("bloqueia com 429 depois do teto", async () => {
    const ip = "198.51.100.77";
    let last: Response | null = null;

    // O teto padrão é 60/min; 61 chamadas devem estourar.
    for (let i = 0; i < 61; i++) {
      last = await reportGet(request("https://qyra.test/api/v1/reports/ga4", ip), {
        params: Promise.resolve({ channel: "ga4" }),
      });
    }

    expect(last?.status).toBe(429);
    expect(last?.headers.get("retry-after")).toBeTruthy();
  });
});

describe("GET /api/v1/overview", () => {
  beforeEach(resetRateLimit);

  it("devolve a visão consolidada", async () => {
    const response = await overviewGet(request("https://qyra.test/api/v1/overview?preset=14d"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.byChannel).toHaveLength(4);
    expect(body.series).toHaveLength(14);
  });
});
