import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Link da peça no Meta Ads.
 *
 * `preview_shareable_link` exige estar logado numa conta com acesso à conta de
 * anúncios. Para quem abre o relatório, isso é uma tela de login — e um botão
 * que não leva a lugar nenhum é pior que botão nenhum.
 */

const RANGE = { from: "2026-02-01", to: "2026-02-03" };
const CREDENCIAIS = { META_ACCESS_TOKEN: "t", META_AD_ACCOUNT_ID: "123" };

function graph(criativoPorAnuncio: Record<string, unknown>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();

    if (url.includes("/ads?") || url.includes("/ads&") || /\/act_\d+\/ads/.test(url)) {
      return new Response(
        JSON.stringify({
          data: Object.entries(criativoPorAnuncio).map(([id, creative]) => ({ id, creative })),
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        data: [
          {
            date_start: "2026-02-01",
            ad_id: "ad-insta",
            ad_name: "Reels agosto",
            campaign_name: "Conversão",
            spend: "100",
            impressions: "1000",
            clicks: "10",
          },
          {
            date_start: "2026-02-01",
            ad_id: "ad-face",
            ad_name: "Post institucional",
            campaign_name: "Conversão",
            spend: "80",
            impressions: "900",
            clicks: "9",
          },
          {
            date_start: "2026-02-01",
            ad_id: "ad-sem-peca",
            ad_name: "Anúncio sem post",
            campaign_name: "Conversão",
            spend: "60",
            impressions: "800",
            clicks: "8",
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
}

async function cartoes() {
  const { fetchMetaAdsReport } = await import("@/server/connectors/meta-ads");
  const report = await fetchMetaAdsReport(RANGE);
  return report.creatives ?? [];
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

describe("link da peça no Meta Ads", () => {
  it("prefere o post público do Instagram", async () => {
    vi.stubGlobal(
      "fetch",
      graph({
        "ad-insta": { instagram_permalink_url: "https://www.instagram.com/p/ABC/" },
      }),
    );

    const card = (await cartoes()).find((c) => c.id === "ad-insta");
    expect(card?.link).toBe("https://www.instagram.com/p/ABC/");
    expect(card?.linkLabel).toBe("Ver no Instagram");
  });

  it("monta a URL pública do Facebook a partir do story id", async () => {
    vi.stubGlobal(
      "fetch",
      graph({ "ad-face": { effective_object_story_id: "1038786355994911_98765" } }),
    );

    const card = (await cartoes()).find((c) => c.id === "ad-face");
    expect(card?.link).toBe("https://www.facebook.com/1038786355994911/posts/98765");
    expect(card?.linkLabel).toBe("Ver publicação");
  });

  it("anúncio sem peça pública fica sem botão", async () => {
    vi.stubGlobal("fetch", graph({ "ad-sem-peca": {} }));

    const card = (await cartoes()).find((c) => c.id === "ad-sem-peca");
    // Sem link é melhor que link para tela de login.
    expect(card?.link).toBeUndefined();
    expect(card?.linkLabel).toBeUndefined();
  });

  it("nunca usa preview_shareable_link", async () => {
    const espiao = graph({
      "ad-insta": {
        instagram_permalink_url: "https://www.instagram.com/p/ABC/",
      },
    });
    vi.stubGlobal("fetch", espiao);
    await cartoes();

    // O campo leva a login; nem pedir vale a pena.
    for (const chamada of espiao.mock.calls) {
      expect(String(chamada[0])).not.toContain("preview_shareable_link");
    }
  });

  it("story id malformado não vira URL quebrada", async () => {
    vi.stubGlobal("fetch", graph({ "ad-face": { effective_object_story_id: "sem-underline" } }));

    expect((await cartoes()).find((c) => c.id === "ad-face")?.link).toBeUndefined();
  });
});

describe("carrossel do anúncio", () => {
  it("abre as artes do carrossel em galeria, uma por cartão", async () => {
    vi.stubGlobal(
      "fetch",
      graph({
        "ad-insta": {
          instagram_permalink_url: "https://www.instagram.com/p/ABC/",
          object_story_spec: {
            link_data: {
              child_attachments: [
                { picture: "https://scontent.fbcdn.net/1.png" },
                { picture: "https://scontent.fbcdn.net/2.png" },
                { picture: "https://scontent.fbcdn.net/3.png" },
              ],
            },
          },
        },
      }),
    );

    const card = (await cartoes()).find((c) => c.id === "ad-insta");
    // Cada cartão sai pelo proxy do próprio domínio, indexado: a URL do CDN da
    // Meta expira e a CSP não abre `img-src` para host de terceiro.
    expect(card?.galeria).toEqual([
      "/criativos/ad-insta/imagem?cartao=0",
      "/criativos/ad-insta/imagem?cartao=1",
      "/criativos/ad-insta/imagem?cartao=2",
    ]);
    // O botão de abrir a peça continua de pé.
    expect(card?.link).toBe("https://www.instagram.com/p/ABC/");
  });

  it("anúncio de arte única não carrega galeria", async () => {
    vi.stubGlobal(
      "fetch",
      graph({ "ad-insta": { instagram_permalink_url: "https://www.instagram.com/p/ABC/" } }),
    );

    // `undefined` em vez de lista de um: a galeria nem chega ao navegador.
    expect((await cartoes()).find((c) => c.id === "ad-insta")?.galeria).toBeUndefined();
  });

  it("cartão sem arte invalida o carrossel inteiro", async () => {
    vi.stubGlobal(
      "fetch",
      graph({
        "ad-insta": {
          object_story_spec: {
            link_data: {
              child_attachments: [{ picture: "https://scontent.fbcdn.net/1.png" }, {}],
            },
          },
        },
      }),
    );

    // Um cartão sem `picture` viraria slide vazio no meio do álbum — melhor
    // cair na arte única do anúncio.
    expect((await cartoes()).find((c) => c.id === "ad-insta")?.galeria).toBeUndefined();
  });

  it("carrossel sem link público ainda ganha as artes", async () => {
    vi.stubGlobal(
      "fetch",
      graph({
        "ad-sem-peca": {
          object_story_spec: {
            link_data: {
              child_attachments: [
                { picture: "https://scontent.fbcdn.net/1.png" },
                { picture: "https://scontent.fbcdn.net/2.png" },
              ],
            },
          },
        },
      }),
    );

    const card = (await cartoes()).find((c) => c.id === "ad-sem-peca");
    expect(card?.galeria).toHaveLength(2);
    expect(card?.link).toBeUndefined();
  });

  it("pede child_attachments à borda /ads", async () => {
    const espiao = graph({});
    vi.stubGlobal("fetch", espiao);
    await cartoes();

    const urls = espiao.mock.calls.map(([e]) => (typeof e === "string" ? e : String(e)));
    // Sem o campo no pedido, a Meta devolve uma arte só e o carrossel some.
    expect(urls.some((u) => u.includes("child_attachments"))).toBe(true);
  });
});
