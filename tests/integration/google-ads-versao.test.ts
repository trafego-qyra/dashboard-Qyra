import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Descoberta da versão da API do Google Ads.
 *
 * Versão aposentada não devolve erro de API: a URL some e o Google responde
 * 404 com página HTML. O painel ficou meses apontando para a `v18` sem
 * ninguém perceber, porque o erro parecia problema de token.
 */

const RANGE = { from: "2026-02-01", to: "2026-02-03" };

const CREDENCIAIS = {
  GOOGLE_CLIENT_ID: "cid",
  GOOGLE_CLIENT_SECRET: "secret",
  GOOGLE_REFRESH_TOKEN: "refresh",
  GOOGLE_ADS_DEVELOPER_TOKEN: "dev",
  GOOGLE_ADS_CUSTOMER_ID: "123-456-7890",
};

const TOKEN = { access_token: "tok", expires_in: 3600, token_type: "Bearer" };

/** Responde 404 para versões antigas e sucesso a partir de `viva`. */
function googleComVersao(viva: string, urls: string[]) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("oauth2.googleapis.com")) {
      return new Response(JSON.stringify(TOKEN), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    urls.push(url);
    if (!url.includes(`/${viva}/`)) {
      return new Response("<!DOCTYPE html><title>Error 404 (Not Found)</title>", {
        status: 404,
        statusText: "Not Found",
        headers: { "content-type": "text/html" },
      });
    }
    return new Response(JSON.stringify([{ results: [] }]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
}

async function configurar(vars: Record<string, string>) {
  vi.resetModules();
  vi.stubEnv("QYRA_FORCE_MOCK", "false");
  for (const [k, v] of Object.entries(vars)) vi.stubEnv(k, v);
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("versão da API do Google Ads", () => {
  it("desce a lista até achar a versão que ainda existe", async () => {
    await configurar(CREDENCIAIS);
    const urls: string[] = [];
    vi.stubGlobal("fetch", googleComVersao("v20", urls));

    const { fetchGoogleAdsReport, versaoDaApiEmUso } = await import(
      "@/server/connectors/google-ads"
    );
    const report = await fetchGoogleAdsReport(RANGE);

    expect(report.source).toBe("live");
    expect(versaoDaApiEmUso()).toBe("v20");
    // Tentou as mais novas antes: a mais recente que responder é a escolhida.
    expect(urls.some((u) => u.includes("/v22/"))).toBe(true);
  });

  it("obedece a versão fixada e não sonda", async () => {
    await configurar({ ...CREDENCIAIS, GOOGLE_ADS_API_VERSION: "v21" });
    const urls: string[] = [];
    vi.stubGlobal("fetch", googleComVersao("v21", urls));

    const { fetchGoogleAdsReport } = await import("@/server/connectors/google-ads");
    await fetchGoogleAdsReport(RANGE);

    // Fixar existe para parar de sondar: nenhuma outra versão pode ser tocada.
    expect(urls.every((u) => u.includes("/v21/"))).toBe(true);
  });

  it("erro que não é 404 propaga na hora, sem tentar outra versão", async () => {
    await configurar(CREDENCIAIS);
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("oauth2.googleapis.com")) {
          return new Response(JSON.stringify(TOKEN), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        urls.push(url);
        return new Response(JSON.stringify({ error: { message: "USER_PERMISSION_DENIED" } }), {
          status: 403,
          statusText: "Forbidden",
          headers: { "content-type": "application/json" },
        });
      }),
    );

    const { fetchGoogleAdsReport } = await import("@/server/connectors/google-ads");
    await expect(fetchGoogleAdsReport(RANGE)).rejects.toThrow(/403/);

    // Sem varrer a lista: insistir em outra versão transformaria "sem
    // permissão" em confusão, e gastaria três requisições para chegar ao mesmo
    // erro.
    const versoesTocadas = new Set(
      urls.map((u) => u.match(/googleapis\.com\/(v\d+)\//)?.[1]).filter(Boolean),
    );
    expect(versoesTocadas.size).toBe(1);
  });

  it("nenhuma versão viva também propaga, em vez de servir outro número", async () => {
    await configurar(CREDENCIAIS);
    vi.stubGlobal("fetch", googleComVersao("v99", []));

    const { fetchGoogleAdsReport } = await import("@/server/connectors/google-ads");

    // Versão aposentada responde 404 com página HTML, não erro de API. A tela
    // precisa dizer que falhou — servir número de outra fonte esconderia
    // justamente o sintoma que aponta para a lista de versões envelhecida.
    await expect(fetchGoogleAdsReport(RANGE)).rejects.toThrow();
  });
});
