import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A memória que sobrevive à instância.
 *
 * Ela existe para a tela nunca aparecer vazia quando uma API de cota baixa se
 * recusa a responder. O requisito que importa aqui é o oposto do usual: ela
 * pode falhar à vontade, contanto que falhe em silêncio. Rede de segurança que
 * derruba a operação quando ela mesma falha é pior que não ter rede.
 */

const REDIS = {
  KV_REST_API_URL: "https://redis.exemplo.com",
  KV_REST_API_TOKEN: "token-de-teste",
};

async function memoria() {
  return import("@/server/lib/memoria");
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("memória compartilhada", () => {
  it("sem Redis configurado, lembra dentro da instância e não toca na rede", async () => {
    const espiao = vi.fn();
    vi.stubGlobal("fetch", espiao);

    const { lembrar, lembrado } = await memoria();
    await lembrar("k", { a: 1 }, 60);

    expect(await lembrado("k")).toEqual({ a: 1 });
    expect(espiao).not.toHaveBeenCalled();
  });

  it("com Redis, guarda também lá fora", async () => {
    for (const [k, v] of Object.entries(REDIS)) vi.stubEnv(k, v);
    const espiao = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", espiao);

    const { lembrar } = await memoria();
    await lembrar("clarity:ultimo-bom", { a: 1 }, 120);

    const [url, init] = espiao.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/set/clarity%3Aultimo-bom");
    // Sem validade, a chave viveria para sempre e a "última leitura" viraria
    // arqueologia.
    expect(url).toContain("EX=120");
    expect(init.method).toBe("POST");
  });

  it("busca no Redis quando a instância não tem a lembrança", async () => {
    for (const [k, v] of Object.entries(REDIS)) vi.stubEnv(k, v);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ result: JSON.stringify({ a: 2 }) }), { status: 200 }),
      ),
    );

    const { lembrado } = await memoria();

    // É este caminho que cobre a partida a frio — a instância nova nasce sem
    // lembrança nenhuma, e é justamente quando a diretoria abre o painel.
    expect(await lembrado("k")).toEqual({ a: 2 });
  });

  it("chave inexistente devolve nulo, não quebra", async () => {
    for (const [k, v] of Object.entries(REDIS)) vi.stubEnv(k, v);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ result: null }), { status: 200 })),
    );

    const { lembrado } = await memoria();
    expect(await lembrado("k")).toBeNull();
  });

  it("Redis fora do ar não derruba nada", async () => {
    for (const [k, v] of Object.entries(REDIS)) vi.stubEnv(k, v);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("sem rede");
      }),
    );

    const { lembrar, lembrado } = await memoria();

    // Nenhuma das duas pode lançar: quem chama está justamente no caminho de
    // recuperação de uma falha anterior.
    await expect(lembrar("k", { a: 1 }, 60)).resolves.toBeUndefined();
    await expect(lembrado("k")).resolves.toEqual({ a: 1 });
  });

  it("resposta corrompida do Redis devolve nulo em vez de estourar", async () => {
    for (const [k, v] of Object.entries(REDIS)) vi.stubEnv(k, v);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response(JSON.stringify({ result: "isto não é json" }), { status: 200 }),
      ),
    );

    const { lembrado } = await memoria();
    expect(await lembrado("k")).toBeNull();
  });

  it("lembrança vencida não é servida", async () => {
    vi.useFakeTimers();
    const { lembrar, lembrado } = await memoria();

    await lembrar("k", { a: 1 }, 1);
    vi.advanceTimersByTime(2_000);

    expect(await lembrado("k")).toBeNull();
    vi.useRealTimers();
  });
});
