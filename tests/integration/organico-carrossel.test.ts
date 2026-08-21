import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Carrossel do Instagram.
 *
 * A Meta entrega o álbum como uma mídia só, e a `media_url` dela é a primeira
 * imagem. Sem pedir `children`, o cartão mostrava a capa e escondia o resto —
 * que é justamente onde quem monta carrossel põe o argumento.
 */

const CREDENCIAIS = {
  META_ACCESS_TOKEN: "token",
  META_AD_ACCOUNT_ID: "123",
  META_PAGE_ID: "999",
  META_IG_USER_ID: "888",
};

interface Publicacao {
  id: string;
  media_type: string;
  children?: { data: Array<{ id: string }> };
}

function grafo(publicacoes: Publicacao[]) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();

    if (url.includes("/media?") || url.includes("/media&") || /\/media\b/.test(url)) {
      return new Response(
        JSON.stringify({
          data: publicacoes.map((p) => ({
            ...p,
            caption: `Post ${p.id}`,
            timestamp: "2026-02-02T10:00:00+0000",
            like_count: 10,
            comments_count: 2,
            permalink: "https://www.instagram.com/p/abc/",
          })),
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

async function relatorio(publicacoes: Publicacao[]) {
  const chamadas = grafo(publicacoes);
  vi.stubGlobal("fetch", chamadas);
  const { fetchOrganicoReport } = await import("@/server/connectors/organico");
  const report = await fetchOrganicoReport({ from: "2026-02-01", to: "2026-02-03" });
  return { report, chamadas };
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

describe("carrossel do orgânico", () => {
  it("pede os filhos do álbum à Graph", async () => {
    const { chamadas } = await relatorio([{ id: "1", media_type: "IMAGE" }]);

    const urls = chamadas.mock.calls.map(([entrada]) =>
      typeof entrada === "string" ? entrada : String(entrada),
    );
    // Sem `children{id}` no pedido, a resposta nunca traz as artes de dentro.
    expect(urls.some((u) => u.includes("children"))).toBe(true);
  });

  it("monta a galeria com todas as artes, pelo proxy do próprio domínio", async () => {
    const { report } = await relatorio([
      {
        id: "10",
        media_type: "CAROUSEL_ALBUM",
        children: { data: [{ id: "101" }, { id: "102" }, { id: "103" }] },
      },
    ]);

    const cartao = report.creatives?.[0];
    expect(cartao?.galeria).toEqual([
      "/publicacoes/101/imagem",
      "/publicacoes/102/imagem",
      "/publicacoes/103/imagem",
    ]);
    // Nenhuma URL do CDN da Meta: elas expiram e a CSP do painel não abre
    // `img-src` para host de terceiro.
    for (const arte of cartao?.galeria ?? []) expect(arte.startsWith("/publicacoes/")).toBe(true);
  });

  it("publicação simples não carrega galeria", async () => {
    const { report } = await relatorio([{ id: "20", media_type: "IMAGE" }]);

    // `undefined` em vez de lista de um: assim a galeria nem é serializada
    // para o navegador, e o cartão cai no quadro único.
    expect(report.creatives?.[0]?.galeria).toBeUndefined();
  });

  it("corta o álbum no teto do Instagram", async () => {
    const filhos = Array.from({ length: 30 }, (_, i) => ({ id: String(500 + i) }));
    const { report } = await relatorio([
      { id: "30", media_type: "CAROUSEL_ALBUM", children: { data: filhos } },
    ]);

    // Cada arte é uma requisição ao proxy; álbum fora do padrão não vira
    // trinta chamadas ao carregar a tela.
    expect(report.creatives?.[0]?.galeria).toHaveLength(20);
  });
});
