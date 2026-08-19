import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Proxy da arte do anúncio.
 *
 * O risco aqui não é visual: a rota faz uma requisição de saída a partir de um
 * identificador vindo da URL. Sem as travas, vira proxy aberto.
 */

async function chamar(id: string) {
  const { GET } = await import("@/app/criativos/[id]/imagem/route");
  return GET(new Request(`http://local/criativos/${id}/imagem`), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.stubEnv("QYRA_FORCE_MOCK", "false");
  vi.stubEnv("META_ACCESS_TOKEN", "token");
  vi.stubEnv("META_AD_ACCOUNT_ID", "123");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("proxy da arte do criativo", () => {
  it("recusa identificador que não seja numérico", async () => {
    const espiao = vi.fn();
    vi.stubGlobal("fetch", espiao);

    const resposta = await chamar("../../etc/passwd");

    expect(resposta.status).toBe(400);
    // A trava tem que barrar antes de qualquer requisição de saída.
    expect(espiao).not.toHaveBeenCalled();
  });

  it("recusa arte hospedada fora dos domínios da Meta", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("graph.facebook.com")) {
          return new Response(
            JSON.stringify({ creative: { image_url: "https://interno.exemplo/segredo.png" } }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        throw new Error("não deveria buscar host de fora");
      }),
    );

    const resposta = await chamar("123456");

    // A URL vem da Graph, não do cliente — mas uma resposta inesperada não pode
    // transformar a rota em porta de saída para a rede interna.
    expect(resposta.status).toBe(502);
  });

  it("recusa origem que não devolve imagem", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("graph.facebook.com")) {
          return new Response(
            JSON.stringify({
              creative: { image_url: "https://scontent.fbcdn.net/v/arte.png" },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        return new Response("<html>login</html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }),
    );

    expect((await chamar("123456")).status).toBe(502);
  });

  it("entrega a arte com cache privado", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("graph.facebook.com")) {
          return new Response(
            JSON.stringify({
              creative: { image_url: "https://scontent.fbcdn.net/v/arte.png" },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        return new Response("bytes", { status: 200, headers: { "content-type": "image/jpeg" } });
      }),
    );

    const resposta = await chamar("123456");

    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("content-type")).toBe("image/jpeg");
    // `private`: arte de campanha do cliente não pode parar em cache compartilhado.
    expect(resposta.headers.get("cache-control")).toMatch(/private/);
  });

  it("falha da Graph vira 404, nunca erro que suba para a tela", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("rede caiu");
      }),
    );

    expect((await chamar("123456")).status).toBe(404);
  });
});
