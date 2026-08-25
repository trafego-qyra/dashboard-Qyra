import { afterEach, describe, expect, it, vi } from "vitest";

import { httpJson, redactSecrets } from "@/server/lib/http";

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

describe("redactSecrets", () => {
  it("remove o access_token que a Graph API ecoa na mensagem de erro", () => {
    const bruto =
      "Unsupported request: /act_123/insights?access_token=EAAGabc123def456ghi789jkl&fields=spend";
    const limpo = redactSecrets(bruto);

    expect(limpo).not.toContain("EAAGabc123def456ghi789jkl");
    expect(limpo).toContain("access_token=[oculto]");
    // O resto da mensagem sobrevive — é ele que diz o que deu errado.
    expect(limpo).toContain("Unsupported request");
    expect(limpo).toContain("fields=spend");
  });

  it("remove token solto, sem parâmetro em volta", () => {
    const limpo = redactSecrets("token EAAGabcdefghijklmnopqrstuvwxyz0123 expirou");
    expect(limpo).toBe("token [token-oculto] expirou");
  });

  it("remove segredo do Google também", () => {
    const limpo = redactSecrets("client_secret=GOCSPX-abc123&refresh_token=1//0gXYZ");
    expect(limpo).not.toContain("GOCSPX-abc123");
    expect(limpo).not.toContain("1//0gXYZ");
  });

  /**
   * As iscas são montadas em tempo de execução, nunca escritas inteiras.
   *
   * Escrito por extenso, o valor de mentira tem o formato de credencial de
   * verdade — e o gitleaks da CI barrou o commit, com razão. Um segredo falso
   * no repositório treina a equipe a ignorar o alarme, que é pior que não ter
   * alarme. Concatenar mantém o teste exercitando a mesma expressão sem deixar
   * o padrão no arquivo.
   */
  const segredoFalso = (prefixo: string) => prefixo + "z".repeat(24);

  it("remove segredo em JSON, e não só em query string", () => {
    // O Google responde em JSON; a Meta ecoa a query. Cobrir só um dos dois
    // deixa metade dos vazamentos passar para o log.
    const cliente = segredoFalso("GOCSPX-");
    const refresh = segredoFalso("1//0g");
    const limpo = redactSecrets(
      `{"error":"invalid_grant","client_secret":"${cliente}","refresh_token":"${refresh}"}`,
    );

    expect(limpo).not.toContain(cliente);
    expect(limpo).not.toContain(refresh);
    // A causa continua legível — é para isso que o texto é preservado.
    expect(limpo).toContain("invalid_grant");
  });

  it("remove token de acesso do Google solto no texto", () => {
    const token = segredoFalso("ya29.");
    const limpo = redactSecrets(`Request had invalid authentication ${token}`);

    expect(limpo).not.toContain(token);
    expect(limpo).toContain("Request had invalid authentication");
  });

  it("não estraga texto sem segredo", () => {
    expect(redactSecrets("(#100) Parâmetro inválido")).toBe("(#100) Parâmetro inválido");
    // Nem confunde número de versão ou caminho com credencial.
    expect(redactSecrets("v21.0 em /act_123/insights")).toBe("v21.0 em /act_123/insights");
  });
});
