import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Conector do Clarity.
 *
 * A cota da API é diária e a janela é de poucos dias. As duas coisas moldam o
 * comportamento esperado: nunca insistir numa chamada que falhou, e nunca
 * derrubar a tela do Analytics por causa de uma seção complementar.
 */

const CREDENCIAIS = { CLARITY_API_TOKEN: "tok", CLARITY_PROJECT_ID: "y5l8wdf890" };

function respostaDoClarity() {
  return [
    {
      metricName: "Traffic",
      information: [{ totalSessionCount: "1840", totalBotSessionCount: "12" }],
    },
    { metricName: "ScrollDepth", information: [{ averageScrollDepth: "57.4" }] },
    { metricName: "DeadClickCount", information: [{ subTotal: "214" }] },
    { metricName: "RageClickCount", information: [{ subTotal: "37" }] },
    { metricName: "QuickbackClick", information: [{ subTotal: "96" }] },
    { metricName: "ScriptErrorCount", information: [{ subTotal: "12" }] },
  ];
}

function respostaPorUrl() {
  return [
    {
      metricName: "ScrollDepth",
      information: [
        { URL: "/planos", averageScrollDepth: "38.2" },
        { URL: "/", averageScrollDepth: "71.5" },
      ],
    },
    {
      metricName: "Traffic",
      information: [
        { URL: "/planos", totalSessionCount: "380" },
        { URL: "/", totalSessionCount: "772" },
      ],
    },
  ];
}

async function estado() {
  const { fetchClarityResumo } = await import("@/server/connectors/clarity");
  return fetchClarityResumo();
}

/** O resumo, quando há um. Falha o teste se o estado não for `ok`. */
async function resumo() {
  const atual = await estado();
  if (atual.estado !== "ok") throw new Error(`esperava resumo, veio ${atual.estado}`);
  return atual.resumo;
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.stubEnv("QYRA_FORCE_MOCK", "false");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("Clarity", () => {
  it("converte a rolagem de porcentagem para fração, como o resto do painel", async () => {
    for (const [k, v] of Object.entries(CREDENCIAIS)) vi.stubEnv(k, v);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        const corpo = url.includes("dimension1=URL") ? respostaPorUrl() : respostaDoClarity();
        return new Response(JSON.stringify(corpo), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    const r = await resumo();

    // A API devolve 57.4; a tela formata percentual a partir de fração. Sem a
    // divisão, "57,4%" viraria "5740%".
    expect(r.rolagemMedia).toBeCloseTo(0.574, 4);
    expect(r.porPagina.find((p) => p.pagina === "/planos")?.rolagem).toBeCloseTo(0.382, 4);
  });

  it("ordena as páginas por sessões, não pela ordem da API", async () => {
    for (const [k, v] of Object.entries(CREDENCIAIS)) vi.stubEnv(k, v);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        const corpo = url.includes("dimension1=URL") ? respostaPorUrl() : respostaDoClarity();
        return new Response(JSON.stringify(corpo), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    const r = await resumo();

    // A página com mais gente é a que interessa primeiro; a API devolve
    // /planos antes só porque sim.
    expect(r.porPagina.map((p) => p.pagina)).toEqual(["/", "/planos"]);
  });

  it("sem token, diz que falta credencial em vez de tentar a chamada", async () => {
    const espiao = vi.fn();
    vi.stubGlobal("fetch", espiao);

    expect(await estado()).toEqual({ estado: "sem-credencial" });
    expect(espiao).not.toHaveBeenCalled();
  });

  it("cota estourada devolve a última leitura boa, marcada como defasada", async () => {
    for (const [k, v] of Object.entries(CREDENCIAIS)) vi.stubEnv(k, v);

    let quebrar = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (quebrar) return new Response("Exceeded daily limit", { status: 429 });
        const corpo = String(input).includes("dimension1=URL")
          ? respostaPorUrl()
          : respostaDoClarity();
        return new Response(JSON.stringify(corpo), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    const { fetchClarityResumo } = await import("@/server/connectors/clarity");
    const bom = await fetchClarityResumo();
    quebrar = true;
    const depois = await fetchClarityResumo();

    // Dado de ontem, rotulado como de ontem, vale mais que tela de erro: quem
    // abre o painel quer ver o comportamento do site, e cota estourada é
    // problema do painel, não da pergunta.
    expect(depois.estado).toBe("ok");
    if (depois.estado === "ok" && bom.estado === "ok") {
      expect(depois.defasado).toBe(true);
      expect(depois.resumo).toEqual(bom.resumo);
      expect(depois.atualizadoEm).toBe(bom.atualizadoEm);
    }
  });

  it("cota estourada sem leitura anterior não vira 'não configurado'", async () => {
    for (const [k, v] of Object.entries(CREDENCIAIS)) vi.stubEnv(k, v);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("quota exceeded", { status: 429, statusText: "Too Many" })),
    );

    // `resetModules` no `beforeEach` zera o último bom guardado no módulo, que
    // é o que faz este caso ser mesmo "primeira leitura, e falhou".
    const atual = await estado();

    // Com o token cadastrado, "não configurado" manda quem lê procurar o
    // problema no lugar errado — e a cota é justamente a causa mais provável
    // aqui, porque a API dá poucas chamadas por dia e não avisa antes de acabar.
    expect(atual.estado).toBe("falhou");
    if (atual.estado === "falhou") expect(atual.motivo).toMatch(/429/);
  });

  it("guarda a resposta no cache compartilhado, por causa da cota diária", async () => {
    for (const [k, v] of Object.entries(CREDENCIAIS)) vi.stubEnv(k, v);
    const espiao = vi.fn(
      async () =>
        new Response(JSON.stringify(respostaDoClarity()), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", espiao);

    await estado();

    // O cache em memória do painel é por instância, e a Vercel sobe várias:
    // cada partida a frio gastava mais duas chamadas de uma cota que é de
    // poucas por dia. `next.revalidate` é compartilhado entre instâncias.
    for (const chamada of espiao.mock.calls as unknown as Array<[string, RequestInit]>) {
      const init = chamada[1] as RequestInit & { next?: { revalidate?: number } };
      expect(init.next?.revalidate).toBeGreaterThan(0);
      expect(init.cache).toBeUndefined();
    }
  });

  it("não repete chamada que falhou — a cota é diária", async () => {
    for (const [k, v] of Object.entries(CREDENCIAIS)) vi.stubEnv(k, v);
    const espiao = vi.fn(
      async () => new Response("erro", { status: 500, statusText: "Server Error" }),
    );
    vi.stubGlobal("fetch", espiao);

    await estado();

    // Duas chamadas (geral e por URL), nenhuma retentativa. Com retry, um erro
    // transitório queimaria o que resta da cota do dia.
    expect(espiao).toHaveBeenCalledTimes(2);
  });

  it("manda o token no cabeçalho, nunca na URL", async () => {
    for (const [k, v] of Object.entries(CREDENCIAIS)) vi.stubEnv(k, v);
    const espiao = vi.fn(
      async () =>
        new Response(JSON.stringify(respostaDoClarity()), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", espiao);

    await estado();

    for (const chamada of espiao.mock.calls as unknown as Array<[RequestInfo | URL]>) {
      expect(String(chamada[0])).not.toContain("tok");
    }
  });
});
