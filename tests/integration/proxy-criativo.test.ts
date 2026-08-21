import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Proxy da arte do anúncio.
 *
 * O risco aqui não é visual: a rota faz uma requisição de saída a partir de um
 * identificador vindo da URL. Sem as travas, vira proxy aberto.
 */

async function chamar(id: string, busca = "") {
  const { GET } = await import("@/app/criativos/[id]/imagem/route");
  return GET(new Request(`http://local/criativos/${id}/imagem${busca}`), {
    params: Promise.resolve({ id }),
  });
}

/** Anúncio carrossel com três cartões, mais a arte de capa do anúncio. */
function anuncioCarrossel() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("graph.facebook.com")) {
      return new Response(
        JSON.stringify({
          creative: {
            image_url: "https://scontent.fbcdn.net/capa.png",
            object_story_spec: {
              link_data: {
                child_attachments: [
                  { picture: "https://scontent.fbcdn.net/c0.png" },
                  { picture: "https://scontent.fbcdn.net/c1.png" },
                  { picture: "https://scontent.fbcdn.net/c2.png" },
                ],
              },
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response("bytes", { status: 200, headers: { "content-type": "image/jpeg" } });
  });
}

/** Qual arte do CDN a rota foi buscar. */
function arteBuscada(espiao: ReturnType<typeof anuncioCarrossel>): string | undefined {
  return espiao.mock.calls
    .map(([e]) => (typeof e === "string" ? e : String(e)))
    .find((u) => !u.includes("graph.facebook.com"));
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

describe("cartão do carrossel", () => {
  it("serve o cartão pedido, não a capa", async () => {
    const espiao = anuncioCarrossel();
    vi.stubGlobal("fetch", espiao);

    expect((await chamar("123456", "?cartao=1")).status).toBe(200);
    expect(arteBuscada(espiao)).toBe("https://scontent.fbcdn.net/c1.png");
  });

  it("sem `cartao`, continua servindo a arte do anúncio", async () => {
    const espiao = anuncioCarrossel();
    vi.stubGlobal("fetch", espiao);

    await chamar("123456");
    expect(arteBuscada(espiao)).toBe("https://scontent.fbcdn.net/capa.png");
  });

  it("cartão inexistente cai na arte do anúncio em vez de 404", async () => {
    const espiao = anuncioCarrossel();
    vi.stubGlobal("fetch", espiao);

    // Álbum que encolheu entre o relatório e o clique não deve deixar buraco.
    expect((await chamar("123456", "?cartao=7")).status).toBe(200);
    expect(arteBuscada(espiao)).toBe("https://scontent.fbcdn.net/capa.png");
  });

  it("índice fora de faixa ou lixo na query não vira consulta estranha", async () => {
    for (const busca of ["?cartao=-1", "?cartao=99", "?cartao=abc", "?cartao=1.5"]) {
      const espiao = anuncioCarrossel();
      vi.stubGlobal("fetch", espiao);

      expect((await chamar("123456", busca)).status).toBe(200);
      expect(arteBuscada(espiao)).toBe("https://scontent.fbcdn.net/capa.png");
    }
  });
});
