import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EventoDeCrm } from "@/server/connectors/meta-capi";
import { despachar, enfileirar, resumo } from "@/server/fila/eventos-crm";

/**
 * Fila dos eventos de CRM.
 *
 * Duas garantias aqui não são conveniência, são requisito:
 *
 * - **o dado cru não entra no banco.** O hash acontece antes da gravação, e é
 *   o que permite este projeto ter banco sem passar a guardar contato de
 *   paciente (ver docs/seguranca.md);
 * - **o que falha não some.** Um evento que a Meta recusou precisa continuar
 *   visível, com a contagem de tentativas, senão a venda evapora em silêncio.
 */

const TELEFONE = "(11) 99999-9999";
const EMAIL = "maria@gmail.com";

function evento(parcial: Partial<EventoDeCrm> = {}): EventoDeCrm {
  return {
    eventName: "VendaGanha",
    eventTime: 1_758_000_000,
    eventId: "kommo-1",
    identidade: { telefone: TELEFONE, email: EMAIL, criadoEmMs: 1_758_000_000_000 },
    ...parcial,
  };
}

interface Chamada {
  url: string;
  metodo: string;
  corpo: string;
}

/** Um servidor falso que atende o Supabase e a Meta pela mesma porta. */
function servidor(opcoes: { pendentes?: unknown[]; metaRecusa?: boolean; total?: number } = {}) {
  const chamadas: Chamada[] = [];

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const metodo = init?.method ?? "GET";
    chamadas.push({ url, metodo, corpo: String(init?.body ?? "") });

    if (url.includes("graph.facebook.com")) {
      if (opcoes.metaRecusa) {
        return new Response(JSON.stringify({ error: { message: "Bad signature" } }), {
          status: 400,
          statusText: "Bad Request",
        });
      }
      return new Response(JSON.stringify({ events_received: 1, fbtrace_id: "tr" }), {
        status: 200,
      });
    }

    // Gravação no PostgREST: 204 sem corpo, como na vida real.
    if (metodo !== "GET") return new Response(null, { status: 204 });

    // Contagem: o total vai no cabeçalho, não no corpo.
    if ((init?.headers as Record<string, string>)?.prefer?.includes("count=exact")) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-range": `0-0/${opcoes.total ?? 0}` },
      });
    }

    return new Response(JSON.stringify(opcoes.pendentes ?? []), { status: 200 });
  });

  vi.stubGlobal("fetch", fetchMock);
  return chamadas;
}

const gravacoes = (chamadas: Chamada[]) =>
  chamadas.filter((c) => c.metodo === "POST" && !c.url.includes("graph.facebook.com"));
const atualizacoes = (chamadas: Chamada[]) => chamadas.filter((c) => c.metodo === "PATCH");

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://projeto.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "chave-de-servico");
  vi.stubEnv("META_CAPI_DATASET_ID", "1496242995619330");
  vi.stubEnv("META_CAPI_ACCESS_TOKEN", "token-do-conjunto");
  vi.stubEnv("META_CAPI_TEST_EVENT_CODE", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("enfileirar", () => {
  it("NÃO guarda telefone nem e-mail legível", async () => {
    // A garantia que permite este projeto ter banco sem passar a armazenar
    // dado pessoal. Se este teste cair, docs/seguranca.md virou mentira.
    const chamadas = servidor();
    await enfileirar([evento()]);

    const [gravacao] = gravacoes(chamadas);
    expect(gravacao.corpo).not.toContain("99999");
    expect(gravacao.corpo).not.toContain("maria@gmail.com");
    // O hash do e-mail, esse sim.
    expect(gravacao.corpo).toContain(
      "8ff54eeab415dc1a98c472d605195268015352a8b462ab174fe2525b1460e9d6",
    );
  });

  it("separa quem não tem identificador, sem descartar", async () => {
    // O lead de DM sem contato nenhum. Descartar apagaria justamente o número
    // que responde "quanto do funil a Meta não enxerga".
    const chamadas = servidor();
    const resultado = await enfileirar([
      evento({ eventId: "com-contato" }),
      evento({ eventId: "sem-nada", identidade: { criadoEmMs: 1_758_000_000_000 } }),
    ]);

    expect(resultado).toEqual({ enfileirados: 1, semIdentificador: 1 });

    const linhas = JSON.parse(gravacoes(chamadas)[0].corpo);
    expect(linhas).toHaveLength(2);
    expect(linhas[0].status).toBe("pendente");
    expect(linhas[1].status).toBe("sem_identificador");
  });

  it("grava o instante da etapa, não o da gravação", async () => {
    const chamadas = servidor();
    await enfileirar([evento({ eventTime: 1_758_000_000 })]);

    const [linha] = JSON.parse(gravacoes(chamadas)[0].corpo);
    expect(linha.event_time).toBe(new Date(1_758_000_000_000).toISOString());
  });

  it("não grava valor zero", async () => {
    const chamadas = servidor();
    await enfileirar([evento({ valor: 0 })]);

    const [linha] = JSON.parse(gravacoes(chamadas)[0].corpo);
    expect(linha.valor).toBeNull();
  });
});

describe("despachar", () => {
  const pendente = {
    event_id: "kommo-1",
    event_name: "VendaGanha",
    event_time: new Date(1_758_000_000_000).toISOString(),
    user_data: { ph: ["hash"] },
    valor: 2500,
    moeda: "BRL",
    tentativas: 0,
  };

  it("manda o que está pendente e marca como enviado", async () => {
    const chamadas = servidor({ pendentes: [pendente] });
    const resultado = await despachar();

    expect(resultado).toEqual({ tentados: 1, recebidos: 1, falhou: false });

    const corpo = JSON.parse(atualizacoes(chamadas)[0].corpo);
    expect(corpo.status).toBe("enviado");
    expect(corpo.enviado_em).toBeTruthy();
  });

  it("reaproveita o user_data guardado, sem hashear de novo", async () => {
    const chamadas = servidor({ pendentes: [pendente] });
    await despachar();

    const paraMeta = chamadas.find((c) => c.url.includes("graph.facebook.com"));
    expect(JSON.parse(paraMeta?.corpo ?? "{}").data[0].user_data).toEqual({ ph: ["hash"] });
  });

  it("não chama a Meta quando não há nada pendente", async () => {
    const chamadas = servidor({ pendentes: [] });
    const resultado = await despachar();

    expect(resultado).toEqual({ tentados: 0, recebidos: 0, falhou: false });
    expect(chamadas.some((c) => c.url.includes("graph.facebook.com"))).toBe(false);
  });

  it("conta a tentativa quando a Meta recusa, e mantém na fila", async () => {
    const chamadas = servidor({ pendentes: [pendente], metaRecusa: true });
    const resultado = await despachar();

    expect(resultado.falhou).toBe(true);
    expect(resultado.detalhe).toContain("400");

    const corpo = JSON.parse(atualizacoes(chamadas)[0].corpo);
    expect(corpo.tentativas).toBe(1);
    // Ainda pendente: uma recusa não condena o evento.
    expect(corpo.status).toBeUndefined();
  });

  it("tira da fila o que esgotou as tentativas", async () => {
    // Carga malformada seria reenviada para sempre, gastando requisição e
    // escondendo os eventos bons atrás dela.
    const chamadas = servidor({ pendentes: [{ ...pendente, tentativas: 4 }], metaRecusa: true });
    await despachar();

    expect(JSON.parse(atualizacoes(chamadas)[0].corpo).status).toBe("falhou");
  });

  it("não vaza a credencial na resposta guardada", async () => {
    const chamadas = servidor({ pendentes: [pendente], metaRecusa: true });
    await despachar();

    expect(atualizacoes(chamadas)[0].corpo).not.toContain("token-do-conjunto");
  });
});

describe("resumo", () => {
  it("devolve a contagem de cada estado", async () => {
    servidor({ total: 7 });
    await expect(resumo()).resolves.toEqual({
      pendente: 7,
      enviado: 7,
      sem_identificador: 7,
      falhou: 7,
    });
  });
});
