import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buscarClique, lerCaptura, registrar } from "@/server/captura/ponte";

/**
 * A ponte entre o clique no anúncio e a venda no Kommo.
 *
 * Duas garantias aqui não são conveniência, são requisito:
 *
 * - **a rota é pública e não tem senha possível** — qualquer valor embutido
 *   numa tag do GTM é público por definição. O que segura a porta é o formato
 *   do que se aceita, e é isso que a maior parte destes testes exercita;
 * - **o que já foi capturado não se perde.** A pessoa volta ao questionário
 *   dias depois, agora sem `fbc` nenhum, e sobrescrever a linha apagaria o
 *   clique que trouxe a venda.
 */

const CLIENTE = "bfaa05dd-6946-4ac0-9500-cbd312b47907";
const CLIQUE = "fb.1.1758000000000.IwAR_abc-123";
const NAVEGADOR = "fb.1.1758000000000.987654321";

interface Chamada {
  url: string;
  metodo: string;
  corpo: string;
}

/** Um Supabase falso. `guardado` é o que ele finge já ter na tabela. */
function banco(guardado: unknown[] = []) {
  const chamadas: Chamada[] = [];

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const metodo = init?.method ?? "GET";
    chamadas.push({ url, metodo, corpo: String(init?.body ?? "") });

    if (metodo === "GET") {
      return new Response(JSON.stringify(guardado), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response(null, { status: 204 });
  });

  vi.stubGlobal("fetch", fetchMock);
  return chamadas;
}

function corpo(parcial: Record<string, unknown> = {}) {
  return { cliente_id: CLIENTE, fbc: CLIQUE, ...parcial };
}

describe("lerCaptura", () => {
  it("aceita uma captura inteira", () => {
    const lido = lerCaptura(
      corpo({ fbp: NAVEGADOR, utm_source: "meta", utm_campaign: "fundo-sp" }),
    );

    expect(lido).toEqual({
      clienteId: CLIENTE,
      fbc: CLIQUE,
      fbp: NAVEGADOR,
      utmSource: "meta",
      utmMedium: null,
      utmCampaign: "fundo-sp",
      utmContent: null,
    });
  });

  it("recusa quem não é UUID", () => {
    // É o que impede alguém de encher a tabela: sem adivinhar um UUID, não há
    // linha para criar.
    for (const id of ["123", "", "' or 1=1 --", "a".repeat(64), CLIENTE.replace("-", "")]) {
      expect(lerCaptura(corpo({ cliente_id: id }))).toBeNull();
    }
  });

  it("recusa clique fora do formato da Meta", () => {
    for (const fbc of ["javascript:alert(1)", "fb.1.abc.xyz", "IwAR_sozinho", "fb.1.123.x"]) {
      expect(lerCaptura(corpo({ fbc }))).toBeNull();
    }
  });

  it("recusa corpo que não é objeto", () => {
    for (const bruto of [null, "texto", 42, []]) {
      expect(lerCaptura(bruto)).toBeNull();
    }
  });

  it("recusa cliente sem nada de útil junto", () => {
    // Visita orgânica: tem `cliente_id` e nenhum clique. Linha assim não liga
    // campanha a venda nenhuma, só ocupa espaço.
    expect(lerCaptura({ cliente_id: CLIENTE })).toBeNull();
    expect(lerCaptura({ cliente_id: CLIENTE, fbp: NAVEGADOR })).toBeNull();
  });

  it("aceita UTM sozinha, sem clique", () => {
    const lido = lerCaptura({ cliente_id: CLIENTE, utm_source: "meta" });

    expect(lido?.utmSource).toBe("meta");
    expect(lido?.fbc).toBeNull();
  });

  it("corta UTM comprida demais em vez de guardar", () => {
    expect(lerCaptura(corpo({ utm_source: "x".repeat(201) }))?.utmSource).toBeNull();
  });

  it("normaliza o UUID para minúsculas, para a busca casar depois", () => {
    expect(lerCaptura(corpo({ cliente_id: CLIENTE.toUpperCase() }))?.clienteId).toBe(CLIENTE);
  });
});

describe("registrar", () => {
  beforeEach(() => {
    vi.stubEnv("SUPABASE_URL", "https://banco.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "chave");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("insere quando o cliente é novo", async () => {
    const chamadas = banco([]);

    await registrar(lerCaptura(corpo({ utm_source: "meta" })) as never);

    const escrita = chamadas.find((c) => c.metodo === "POST");
    expect(escrita?.url).toContain("captura_clique");
    expect(JSON.parse(escrita?.corpo ?? "[]")[0]).toMatchObject({
      cliente_id: CLIENTE,
      fbc: CLIQUE,
      utm_source: "meta",
    });
  });

  it("não apaga o clique guardado quando a visita seguinte vem sem ele", async () => {
    // O caso que motivou o read-merge-write: a pessoa volta ao questionário
    // por busca orgânica, o cookie `_fbc` já expirou, e a linha continua sendo
    // a única prova de qual anúncio trouxe a venda que vem depois.
    const chamadas = banco([
      { cliente_id: CLIENTE, fbc: CLIQUE, fbp: NAVEGADOR, utm_source: null },
    ]);

    await registrar(lerCaptura({ cliente_id: CLIENTE, utm_source: "organico" }) as never);

    const escrita = chamadas.find((c) => c.metodo === "PATCH");
    const gravado = JSON.parse(escrita?.corpo ?? "{}");
    expect(gravado.fbc).toBe(CLIQUE);
    expect(gravado.fbp).toBe(NAVEGADOR);
    expect(gravado.utm_source).toBe("organico");
  });

  it("atualiza em vez de duplicar quando o cliente já existe", async () => {
    const chamadas = banco([{ cliente_id: CLIENTE, fbc: null, fbp: null }]);

    await registrar(lerCaptura(corpo()) as never);

    expect(chamadas.some((c) => c.metodo === "POST")).toBe(false);
    expect(chamadas.some((c) => c.metodo === "PATCH")).toBe(true);
  });

  it("não escreve nada sem banco configurado", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const chamadas = banco([]);

    await registrar(lerCaptura(corpo()) as never);

    expect(chamadas).toHaveLength(0);
  });
});

describe("buscarClique", () => {
  beforeEach(() => {
    vi.stubEnv("SUPABASE_URL", "https://banco.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "chave");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("devolve o que a ponte guardou", async () => {
    banco([{ cliente_id: CLIENTE, fbc: CLIQUE, fbp: NAVEGADOR }]);

    expect(await buscarClique(CLIENTE)).toEqual({ fbc: CLIQUE, fbp: NAVEGADOR });
  });

  it("devolve nulo quando a linha existe mas está vazia", async () => {
    banco([{ cliente_id: CLIENTE, fbc: null, fbp: null }]);

    expect(await buscarClique(CLIENTE)).toBeNull();
  });

  it("não consulta o banco com identificador fora de formato", async () => {
    const chamadas = banco([]);

    expect(await buscarClique("../../etc/passwd")).toBeNull();
    expect(chamadas).toHaveLength(0);
  });

  it("engole a falha do banco em vez de derrubar a venda", async () => {
    // Quem chama é o webhook, no caminho de um GANHO. Sem a ponte o evento
    // ainda vai com telefone e e-mail; sem o evento, a venda some.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("erro", { status: 500 })),
    );

    expect(await buscarClique(CLIENTE)).toBeNull();
  });
});
