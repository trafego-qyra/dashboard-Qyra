import { afterEach, describe, expect, it, vi } from "vitest";

import { httpJson } from "@/server/lib/http";

/**
 * Política de retry compartilhada pelos conectores. Errar aqui significa ou
 * martelar a API de origem (e tomar bloqueio) ou desistir de uma falha que
 * teria passado na segunda tentativa.
 */

afterEach(() => vi.unstubAllGlobals());

function respond(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), {
    status,
    statusText: String(status),
    headers: { "content-type": "application/json" },
  });
}

describe("httpJson", () => {
  it("devolve o corpo já desserializado", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => respond(200, { ok: true })),
    );
    await expect(httpJson<{ ok: boolean }>("https://api.test/x")).resolves.toEqual({ ok: true });
  });

  it("repete em 429 e entrega o resultado da tentativa seguinte", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(respond(429))
      .mockResolvedValueOnce(respond(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(httpJson("https://api.test/x", { retries: 1 })).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("não repete em erro do cliente — 400 não melhora tentando de novo", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(400));
    vi.stubGlobal("fetch", fetchMock);

    await expect(httpJson("https://api.test/x", { retries: 2 })).rejects.toThrow(/400/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("desiste depois de esgotar as tentativas", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(503));
    vi.stubGlobal("fetch", fetchMock);

    await expect(httpJson("https://api.test/x", { retries: 1 })).rejects.toThrow(/503/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("não vaza o corpo inteiro da resposta na mensagem de erro", async () => {
    const segredo = "token=super-secreto".repeat(200);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(segredo, { status: 500 })),
    );

    await expect(httpJson("https://api.test/x", { retries: 0 })).rejects.toThrow(/500/);
  });

  it("propaga o erro de rede depois das tentativas", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(httpJson("https://api.test/x", { retries: 1 })).rejects.toThrow("ECONNRESET");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
