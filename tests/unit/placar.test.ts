import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { montarPlacar } from "@/server/fila/placar";

/**
 * O placar da atribuição, na tela de Vendas.
 *
 * Ele responde a pergunta que nenhum relatório da Meta responde: quanto do que
 * o CRM sabe chega até lá. A Meta mostra as conversões que recebeu; ela não tem
 * como mostrar as que nunca chegaram.
 *
 * O que está testado aqui é sobretudo **quando ele não aparece**. É enfeite de
 * um relatório sobre dinheiro, e enfeite não pode derrubar receita da tela nem
 * sugerir defeito onde não há.
 */

function banco(contagens: Record<string, number>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const estado = new URL(String(input)).searchParams.get("status")?.replace("eq.", "") ?? "";
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-range": `0-0/${contagens[estado] ?? 0}` },
      });
    }),
  );
}

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://projeto.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "chave");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("montarPlacar", () => {
  it("mede a cobertura sobre o total, não sobre o que deu certo", async () => {
    // 6 de 10 identificáveis: 4 entraram por conversa sem deixar contato.
    banco({ enviado: 5, pendente: 1, sem_identificador: 4, falhou: 0 });
    const placar = await montarPlacar();

    expect(placar?.kpi.value).toBe(0.6);
    expect(placar?.kpi.format).toBe("percent");
    // Taxa comparada com o período anterior produz seta que mente quando não
    // houve o que medir.
    expect(placar?.kpi.semComparacao).toBe(true);
  });

  it("omite da tabela o estado que está zerado", async () => {
    banco({ enviado: 3, pendente: 0, sem_identificador: 0, falhou: 0 });
    const placar = await montarPlacar();

    expect(placar?.tabela.rows).toEqual([{ estado: "Chegou na Meta", eventos: 3 }]);
  });

  it("some com a fila vazia", async () => {
    // Tabela de zeros sugere integração falhando, quando o certo é que ela
    // ainda não começou — e quem lê Vendas não acompanha o encanamento.
    banco({});
    await expect(montarPlacar()).resolves.toBeNull();
  });

  it("some sem banco configurado", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    banco({ enviado: 9 });
    await expect(montarPlacar()).resolves.toBeNull();
  });

  it("some quando o banco não responde, em vez de derrubar a tela", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 500, statusText: "Server Error" })),
    );
    await expect(montarPlacar()).resolves.toBeNull();
  });
});
