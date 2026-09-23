import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A aba de status comercial.
 *
 * O que precisa estar travado aqui é a separação das duas janelas. A tela
 * junta "o que aconteceu no período" com "onde a base está agora", e é
 * justamente essa mistura que fazia o slide montado à mão precisar de
 * asterisco: se a etapa passar a ser contada pelo período, ou o ganho pela
 * base inteira, os números continuam plausíveis e ninguém percebe.
 */

const RANGE = { from: "2026-02-01", to: "2026-02-28" };
const CREDENCIAIS = { KOMMO_SUBDOMAIN: "qyra", KOMMO_ACCESS_TOKEN: "chave" };

const GANHO = 142;
const PERDIDO = 143;

function emSegundos(iso: string): number {
  return Math.floor(Date.parse(iso) / 1000);
}

interface LeadFalso {
  id: number;
  price?: number;
  status_id?: number;
  created_at?: number;
  closed_at?: number;
}

/**
 * Dublê da API, respeitando o filtro pedido.
 *
 * A consulta sem filtro de data é a da base inteira, e é o que separa esta
 * tela do relatório de canal: devolver o mesmo recorte para as três consultas
 * esconderia o dia em que o filtro voltasse a ser aplicado onde não deve.
 */
interface EventoFalso {
  type: string;
  entity_id: number;
  entity_type?: string;
  created_at: number;
}

function kommo(
  leads: LeadFalso[],
  etapas: Array<{ id: number; name: string; sort?: number }>,
  eventos: EventoFalso[] | "falha" = [],
) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();

    if (url.includes("/events")) {
      if (eventos === "falha") return new Response("sem escopo", { status: 403 });
      // Devolve tudo, de propósito: a API do Kommo ignora filtro que não
      // reconhece em silêncio, e o conector precisa sobreviver a isso.
      return new Response(JSON.stringify({ _embedded: { events: eventos } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (url.includes("/leads/pipelines")) {
      return new Response(
        JSON.stringify({ _embedded: { pipelines: [{ id: 1, _embedded: { statuses: etapas } }] } }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    const endereco = new URL(url);
    const porFechamento = endereco.searchParams.has("filter[closed_at][from]");
    const porCriacao = endereco.searchParams.has("filter[created_at][from]");

    // Sem filtro de data: a base inteira, que é o que a tela de status precisa.
    if (!porFechamento && !porCriacao) {
      return new Response(JSON.stringify({ _embedded: { leads } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    const campo = porFechamento ? "closed_at" : "created_at";
    const de = Number(endereco.searchParams.get(`filter[${campo}][from]`) ?? 0);
    const ate = Number(
      endereco.searchParams.get(`filter[${campo}][to]`) ?? Number.MAX_SAFE_INTEGER,
    );

    const recorte = leads.filter((lead) => {
      const quando = lead[campo];
      return typeof quando === "number" && quando >= de && quando <= ate;
    });

    return new Response(JSON.stringify({ _embedded: { leads: recorte } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
}

async function status(
  leads: LeadFalso[],
  etapas: Array<{ id: number; name: string; sort?: number }> = [],
  eventos: EventoFalso[] | "falha" = [],
) {
  vi.stubGlobal("fetch", kommo(leads, etapas, eventos));
  const { fetchStatusDeVendas } = await import("@/server/connectors/kommo");
  return fetchStatusDeVendas(RANGE);
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

const ETAPAS = [
  { id: 20, name: "Demanda", sort: 10 },
  { id: 30, name: "Qualificação", sort: 20 },
  { id: 40, name: "Negociação", sort: 30 },
  { id: 50, name: "Reabordagem", sort: 40 },
];

describe("status de vendas", () => {
  it("as etapas contam a base inteira, e não o período", async () => {
    const resultado = await status(
      [
        // Fora do período por criação — e ainda assim parado em reabordagem.
        { id: 1, status_id: 50, created_at: emSegundos("2025-11-02T10:00:00Z") },
        { id: 2, status_id: 50, created_at: emSegundos("2026-02-03T10:00:00Z") },
        { id: 3, status_id: 30, created_at: emSegundos("2026-02-04T10:00:00Z") },
      ],
      ETAPAS,
    );

    // É o negócio parado há meses que a tela existe para mostrar. Contá-lo só
    // se tiver entrado no período esconderia justamente a fila que trava.
    expect(resultado.etapas).toEqual([
      { nome: "Demanda", negocios: 0 },
      { nome: "Qualificação", negocios: 1 },
      { nome: "Negociação", negocios: 0 },
      { nome: "Reabordagem", negocios: 2 },
    ]);
    expect(resultado.baseTotal).toBe(3);
  });

  it("ganhos, perdidos e receita contam o período, pelo fechamento", async () => {
    const resultado = await status(
      [
        {
          id: 1,
          price: 2500,
          status_id: GANHO,
          created_at: emSegundos("2026-01-02T10:00:00Z"),
          closed_at: emSegundos("2026-02-05T10:00:00Z"),
        },
        {
          id: 2,
          price: 9000,
          status_id: GANHO,
          created_at: emSegundos("2025-12-02T10:00:00Z"),
          closed_at: emSegundos("2025-12-20T10:00:00Z"),
        },
        {
          id: 3,
          status_id: PERDIDO,
          created_at: emSegundos("2026-02-02T10:00:00Z"),
          closed_at: emSegundos("2026-02-06T10:00:00Z"),
        },
      ],
      ETAPAS,
    );

    // A venda de dezembro não é deste ciclo, e somá-la faria a meta do mês
    // parecer batida com o resultado do mês passado.
    expect(resultado.ganhos).toBe(1);
    expect(resultado.receita).toBe(2500);
    expect(resultado.perdidos).toBe(1);
  });

  it("leads gerados conta pela criação, não pelo fechamento", async () => {
    const resultado = await status(
      [
        { id: 1, status_id: 20, created_at: emSegundos("2026-02-03T10:00:00Z") },
        { id: 2, status_id: 20, created_at: emSegundos("2025-10-03T10:00:00Z") },
      ],
      ETAPAS,
    );

    expect(resultado.gerados).toBe(1);
  });

  it("ganho e perdido saem marcados como desfecho, qualquer que seja o nome", async () => {
    const resultado = await status(
      [
        {
          id: 1,
          status_id: GANHO,
          created_at: emSegundos("2026-02-03T10:00:00Z"),
          closed_at: emSegundos("2026-02-04T10:00:00Z"),
        },
        {
          id: 2,
          status_id: PERDIDO,
          created_at: emSegundos("2026-02-03T10:00:00Z"),
          closed_at: emSegundos("2026-02-04T10:00:00Z"),
        },
      ],
      [
        ...ETAPAS,
        // A conta é livre para batizar as etapas fixas como quiser.
        { id: GANHO, name: "Fechado - ganho", sort: 100 },
        { id: PERDIDO, name: "Fechado - não realizado", sort: 110 },
      ],
    );

    const fim = resultado.etapas.filter((e) => e.desfecho !== undefined);

    // Confiar no nome faria "Fechado - ganho" virar uma etapa de espera, e o
    // "ainda em jogo" da tela passaria a incluir venda fechada.
    expect(fim).toEqual([
      { nome: "Fechado - ganho", negocios: 1, desfecho: "ganho" },
      { nome: "Fechado - não realizado", negocios: 1, desfecho: "perdido" },
    ]);
  });

  it("etapa fora do esqueleto entra no fim, em vez de sumir da conta", async () => {
    const resultado = await status(
      [
        { id: 1, status_id: 20, created_at: emSegundos("2026-02-03T10:00:00Z") },
        { id: 2, status_id: 999, created_at: emSegundos("2026-02-03T10:00:00Z") },
      ],
      ETAPAS,
    );

    // Etapa apagada com negócio dentro. Some da lista e a soma das etapas
    // deixa de fechar com o total da base — sem nenhum sinal de erro.
    expect(resultado.etapas.at(-1)).toEqual({ nome: "Etapa 999", negocios: 1 });
    expect(resultado.etapas.reduce((a, e) => a + e.negocios, 0)).toBe(resultado.baseTotal);
  });

  it("sem meta configurada, não inventa alvo — e avisa", async () => {
    const resultado = await status(
      [{ id: 1, status_id: 20, created_at: emSegundos("2026-02-03T10:00:00Z") }],
      ETAPAS,
    );

    expect(resultado.metas).toEqual({ vendas: 0, receita: 0 });
    expect(resultado.notices.some((a) => /meta/i.test(a.text))).toBe(true);
  });

  it("lê as metas do ambiente", async () => {
    vi.stubEnv("QYRA_META_VENDAS", "30");
    vi.stubEnv("QYRA_META_RECEITA", "56970");

    const resultado = await status(
      [{ id: 1, status_id: 20, created_at: emSegundos("2026-02-03T10:00:00Z") }],
      ETAPAS,
    );

    expect(resultado.metas).toEqual({ vendas: 30, receita: 56970 });
    expect(resultado.notices.some((a) => /meta/i.test(a.text))).toBe(false);
  });

  it("meta ilegível vira ausência de meta, não zero cobrado na tela", async () => {
    vi.stubEnv("QYRA_META_VENDAS", "trinta");

    const resultado = await status(
      [{ id: 1, status_id: 20, created_at: emSegundos("2026-02-03T10:00:00Z") }],
      ETAPAS,
    );

    expect(resultado.metas.vendas).toBe(0);
  });

  it("mede a espera entre a pergunta e a primeira resposta de cada negócio", async () => {
    const base = emSegundos("2026-02-10T09:00:00Z");
    const resultado = await status([{ id: 1, status_id: 20, created_at: base }], ETAPAS, [
      // Negócio 1: respondido em 60s.
      { type: "incoming_chat_message", entity_id: 1, entity_type: "lead", created_at: base },
      {
        type: "outgoing_chat_message",
        entity_id: 1,
        entity_type: "lead",
        created_at: base + 60,
      },
      // Negócio 2: respondido em 200s.
      { type: "incoming_chat_message", entity_id: 2, entity_type: "lead", created_at: base },
      {
        type: "outgoing_chat_message",
        entity_id: 2,
        entity_type: "lead",
        created_at: base + 200,
      },
      // Negócio 3: respondido em 3h. É o que uma média esconderia.
      { type: "incoming_chat_message", entity_id: 3, entity_type: "lead", created_at: base },
      {
        type: "outgoing_chat_message",
        entity_id: 3,
        entity_type: "lead",
        created_at: base + 10_800,
      },
    ]);

    // A média daria 3.687s — uma hora de espera que não descreve nenhum dos
    // três atendimentos. A mediana é o do meio.
    expect(resultado.tempoDeResposta.mediana).toBe(200);
    expect(resultado.tempoDeResposta.base).toBe(3);
  });

  it("mensagem enviada antes da pergunta não conta como resposta", async () => {
    const base = emSegundos("2026-02-10T09:00:00Z");
    const resultado = await status([], ETAPAS, [
      // A campanha que provocou o contato sai antes da pergunta.
      { type: "outgoing_chat_message", entity_id: 1, entity_type: "lead", created_at: base },
      {
        type: "incoming_chat_message",
        entity_id: 1,
        entity_type: "lead",
        created_at: base + 300,
      },
      {
        type: "outgoing_chat_message",
        entity_id: 1,
        entity_type: "lead",
        created_at: base + 360,
      },
    ]);

    // Contar a primeira saída daria tempo negativo, e um Math.min ingênuo daria
    // "respondido antes de perguntar".
    expect(resultado.tempoDeResposta.mediana).toBe(60);
  });

  it("negócio sem resposta fica de fora, em vez de entrar com zero", async () => {
    const base = emSegundos("2026-02-10T09:00:00Z");
    const resultado = await status([], ETAPAS, [
      { type: "incoming_chat_message", entity_id: 1, entity_type: "lead", created_at: base },
      { type: "incoming_chat_message", entity_id: 2, entity_type: "lead", created_at: base },
      {
        type: "outgoing_chat_message",
        entity_id: 2,
        entity_type: "lead",
        created_at: base + 120,
      },
    ]);

    // Quem nunca foi respondido não tem tempo de resposta. Entrar com zero
    // melhoraria a mediana justamente por causa de quem foi ignorado.
    expect(resultado.tempoDeResposta.base).toBe(1);
    expect(resultado.tempoDeResposta.mediana).toBe(120);
  });

  it("evento fora do período é descartado mesmo se a API ignorar o filtro", async () => {
    const dentro = emSegundos("2026-02-10T09:00:00Z");
    const fora = emSegundos("2025-08-10T09:00:00Z");
    const resultado = await status([], ETAPAS, [
      { type: "incoming_chat_message", entity_id: 1, entity_type: "lead", created_at: dentro },
      {
        type: "outgoing_chat_message",
        entity_id: 1,
        entity_type: "lead",
        created_at: dentro + 90,
      },
      { type: "incoming_chat_message", entity_id: 2, entity_type: "lead", created_at: fora },
      { type: "outgoing_chat_message", entity_id: 2, entity_type: "lead", created_at: fora + 5 },
    ]);

    // O Kommo ignora filtro desconhecido em silêncio. Sem reconferir, a
    // mediana sairia calculada sobre o histórico inteiro — plausível e errada.
    expect(resultado.tempoDeResposta.base).toBe(1);
    expect(resultado.tempoDeResposta.mediana).toBe(90);
  });

  it("evento que não é de negócio não entra na conta", async () => {
    const base = emSegundos("2026-02-10T09:00:00Z");
    const resultado = await status([], ETAPAS, [
      { type: "incoming_chat_message", entity_id: 9, entity_type: "contact", created_at: base },
      {
        type: "outgoing_chat_message",
        entity_id: 9,
        entity_type: "contact",
        created_at: base + 30,
      },
    ]);

    expect(resultado.tempoDeResposta.motivo).toBe("sem-evento");
  });

  it("sem conversa nenhuma, diz que não houve o que medir — nunca zero", async () => {
    const resultado = await status([], ETAPAS, []);

    // Zero segundos na tela se leria como atendimento instantâneo, que é o
    // oposto do que aconteceu.
    expect(resultado.tempoDeResposta).toMatchObject({
      mediana: null,
      base: 0,
      motivo: "sem-evento",
    });
  });

  it("consulta de eventos negada não derruba a tela, e é dita como falha", async () => {
    const resultado = await status(
      [{ id: 1, status_id: 20, created_at: emSegundos("2026-02-03T10:00:00Z") }],
      ETAPAS,
      "falha",
    );

    // Escopo do token sem acesso a eventos é o caso mais provável, e o resto
    // da tela não depende disso.
    expect(resultado.tempoDeResposta.motivo).toBe("falhou");
    expect(resultado.gerados).toBe(1);
    expect(resultado.notices.some((a) => /eventos/i.test(a.text))).toBe(true);
  });

  it("lê o teto de tempo de resposta do ambiente", async () => {
    vi.stubEnv("QYRA_META_TEMPO_RESPOSTA", "600");

    const resultado = await status([], ETAPAS, []);

    expect(resultado.tempoDeResposta.meta).toBe(600);
  });

  it("sem credencial, devolve demonstração em vez de tela vazia", async () => {
    vi.stubEnv("KOMMO_ACCESS_TOKEN", "");
    vi.stubEnv("KOMMO_SUBDOMAIN", "");

    const resultado = await status([], ETAPAS);

    expect(resultado.source).toBe("mock");
    expect(resultado.etapas.length).toBeGreaterThan(0);
    expect(resultado.notices.some((a) => /demonstração/i.test(a.text))).toBe(true);
  });
});
