import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Vendas pelo Kommo.
 *
 * O que este conector faz de diferente dos outros: ele lê **dinheiro**. Um erro
 * de contagem aqui não deixa a tela feia — faz a clínica decidir orçamento com
 * o número errado.
 */

const RANGE = { from: "2026-02-01", to: "2026-02-28" };
const CREDENCIAIS = { KOMMO_SUBDOMAIN: "qyra", KOMMO_ACCESS_TOKEN: "chave" };

const GANHO = 142;
const PERDIDO = 143;

/** Unix em segundos, que é a unidade do Kommo. */
function emSegundos(iso: string): number {
  return Math.floor(Date.parse(iso) / 1000);
}

interface LeadFalso {
  id: number;
  price?: number;
  status_id?: number;
  created_at?: number;
  closed_at?: number;
  loss_reason_id?: number;
  custom_fields_values?: Array<{ field_name?: string; values?: Array<{ value?: string }> }>;
}

interface EventoFalso {
  type?: string;
  entity_id?: number;
  entity_type?: string;
  created_at?: number;
  created_by?: number;
}

interface Extras {
  eventos?: EventoFalso[];
  motivos?: Array<{ id: number; name: string }>;
}

function kommo(
  leads: LeadFalso[],
  etapas: Array<{ id: number; name: string }> = [],
  extras: Extras = {},
) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    // Rotas específicas antes da genérica `/leads`: `/leads/loss_reasons` e
    // `/leads/unsorted` também contêm "/leads".
    if (url.includes("/leads/pipelines")) {
      return json({ _embedded: { pipelines: [{ id: 1, _embedded: { statuses: etapas } }] } });
    }
    if (url.includes("/leads/loss_reasons")) {
      return json({ _embedded: { loss_reasons: extras.motivos ?? [] } });
    }
    if (url.includes("/leads/unsorted")) {
      return json({ _embedded: { unsorted: [] } });
    }
    if (url.includes("/events")) {
      return json({ _embedded: { events: extras.eventos ?? [] } });
    }

    return json({ _embedded: { leads } });
  });
}

async function relatorio(
  leads: LeadFalso[],
  etapas?: Array<{ id: number; name: string }>,
  extras?: Extras,
) {
  const chamadas = kommo(leads, etapas, extras);
  vi.stubGlobal("fetch", chamadas);
  const { fetchVendasReport } = await import("@/server/connectors/kommo");
  return { report: await fetchVendasReport(RANGE), chamadas };
}

const kpi = (r: Awaited<ReturnType<typeof relatorio>>["report"], chave: string) =>
  r.kpis.find((k) => k.key === chave)?.value ?? 0;

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

describe("vendas pelo Kommo", () => {
  it("só conta como receita o negócio ganho", async () => {
    const { report } = await relatorio([
      { id: 1, price: 1000, status_id: GANHO, created_at: emSegundos("2026-02-03T10:00:00Z") },
      { id: 2, price: 5000, status_id: PERDIDO, created_at: emSegundos("2026-02-04T10:00:00Z") },
      { id: 3, price: 9000, status_id: 20, created_at: emSegundos("2026-02-05T10:00:00Z") },
    ]);

    // Somar o negócio em aberto ou o perdido daria R$ 15.000 de receita que
    // não existe — e um ticket médio inventado junto.
    expect(kpi(report, "vendas")).toBe(1);
    expect(kpi(report, "receita")).toBe(1000);
    expect(kpi(report, "ticket")).toBe(1000);
    expect(kpi(report, "emAberto")).toBe(1);
  });

  it("a taxa de conversão usa todos os negócios como base", async () => {
    const { report } = await relatorio([
      { id: 1, price: 100, status_id: GANHO, created_at: emSegundos("2026-02-03T10:00:00Z") },
      { id: 2, status_id: PERDIDO, created_at: emSegundos("2026-02-03T10:00:00Z") },
      { id: 3, status_id: 20, created_at: emSegundos("2026-02-03T10:00:00Z") },
      { id: 4, status_id: 20, created_at: emSegundos("2026-02-03T10:00:00Z") },
    ]);

    expect(kpi(report, "conversao")).toBeCloseTo(0.25, 6);
  });

  it("a venda entra no dia em que fechou, não no dia em que o lead nasceu", async () => {
    const { report } = await relatorio([
      {
        id: 1,
        price: 2000,
        status_id: GANHO,
        created_at: emSegundos("2026-02-02T10:00:00Z"),
        closed_at: emSegundos("2026-02-20T10:00:00Z"),
      },
    ]);

    const nascimento = report.series.find((p) => p.date === "2026-02-02");
    const fechamento = report.series.find((p) => p.date === "2026-02-20");

    // "Quanto entrou" e "quanto vendemos" são perguntas diferentes: creditar a
    // venda no dia da criação faria a série de receita mentir sobre o caixa.
    expect(nascimento?.leads).toBe(1);
    expect(nascimento?.receita).toBe(0);
    expect(fechamento?.receita).toBe(2000);
    expect(fechamento?.vendas).toBe(1);
  });

  it("o ciclo médio ignora quem não fechou", async () => {
    const { report } = await relatorio([
      {
        id: 1,
        price: 100,
        status_id: GANHO,
        created_at: emSegundos("2026-02-01T00:00:00Z"),
        closed_at: emSegundos("2026-02-11T00:00:00Z"),
      },
      // Sem `closed_at`: entrar na média com zero puxaria o ciclo para baixo.
      { id: 2, status_id: 20, created_at: emSegundos("2026-02-01T00:00:00Z") },
    ]);

    expect(kpi(report, "ciclo")).toBeCloseTo(10, 3);
  });

  it("agrupa por UTM quando o negócio traz o campo", async () => {
    const utm = (source: string, campanha: string) => [
      { field_name: "utm_source", values: [{ value: source }] },
      { field_name: "utm_campaign", values: [{ value: campanha }] },
    ];

    const { report } = await relatorio([
      {
        id: 1,
        price: 3000,
        status_id: GANHO,
        created_at: emSegundos("2026-02-03T10:00:00Z"),
        custom_fields_values: utm("meta", "emagrecimento"),
      },
      {
        id: 2,
        status_id: PERDIDO,
        created_at: emSegundos("2026-02-03T10:00:00Z"),
        custom_fields_values: utm("meta", "emagrecimento"),
      },
      {
        id: 3,
        price: 1000,
        status_id: GANHO,
        created_at: emSegundos("2026-02-03T10:00:00Z"),
        custom_fields_values: utm("google", "marca"),
      },
    ]);

    const origens = report.tables.find((t) => t.title === "Vendas por origem");
    const meta = origens?.rows.find((r) => String(r.origem).startsWith("meta"));

    expect(meta?.leads).toBe(2);
    expect(meta?.vendas).toBe(1);
    expect(meta?.receita).toBe(3000);
    expect(meta?.taxa).toBeCloseTo(0.5, 6);
  });

  it("sem UTM nenhuma, avisa em vez de inventar origem", async () => {
    const { report } = await relatorio([
      { id: 1, price: 100, status_id: GANHO, created_at: emSegundos("2026-02-03T10:00:00Z") },
    ]);

    // O aviso é de operação: quem abre o painel não precisa vê-lo, quem
    // configura precisa.
    expect(report.notices.some((n) => /UTM/i.test(n.text))).toBe(true);
    expect(report.notices.every((n) => n.audience === "operacao")).toBe(true);
  });

  it("venda ganha sem valor avisa em vez de deixar o zero sozinho", async () => {
    const { report } = await relatorio([
      // É o estado real da conta: negócio movido para ganho, campo de valor
      // nunca preenchido.
      { id: 1, status_id: GANHO, created_at: emSegundos("2026-02-03T10:00:00Z") },
      { id: 2, status_id: GANHO, created_at: emSegundos("2026-02-04T10:00:00Z") },
    ]);

    expect(kpi(report, "vendas")).toBe(2);
    expect(kpi(report, "receita")).toBe(0);
    // Zero sem explicação lê como "não vendemos nada", que é o oposto do fato.
    expect(report.kpis.find((k) => k.key === "receita")?.hint).toMatch(/sem valor preenchido/i);
    expect(report.notices.some((n) => /valor preenchido/i.test(n.text))).toBe(true);
  });

  it("não inventa aviso de valor quando a receita existe", async () => {
    const { report } = await relatorio([
      { id: 1, price: 500, status_id: GANHO, created_at: emSegundos("2026-02-03T10:00:00Z") },
    ]);

    expect(report.kpis.find((k) => k.key === "receita")?.hint).toBeUndefined();
    expect(report.notices.some((n) => /valor preenchido/i.test(n.text))).toBe(false);
  });

  it("conta os leads de entrada, que não vêm em /leads", async () => {
    const chamadas = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/leads/unsorted")) {
        return new Response(JSON.stringify({ _embedded: { unsorted: [{}, {}, {}] } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/leads/pipelines")) {
        return new Response(JSON.stringify({ _embedded: { pipelines: [] } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({
          _embedded: {
            leads: [{ id: 1, status_id: 20, created_at: emSegundos("2026-02-03T10:00:00Z") }],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", chamadas);

    const { fetchVendasReport } = await import("@/server/connectors/kommo");
    const report = await fetchVendasReport(RANGE);
    const funil = report.tables.find((t) => t.title === "Negócios por etapa");

    // Sem essa linha o funil perde o topo — é por ali que tudo entra.
    expect(funil?.rows.find((r) => String(r.etapa).startsWith("Leads de entrada"))?.negocios).toBe(
      3,
    );
  });

  it("usa o nome real da etapa, e não o número", async () => {
    const { report } = await relatorio(
      [{ id: 1, status_id: 77, created_at: emSegundos("2026-02-03T10:00:00Z") }],
      [{ id: 77, name: "Avaliação agendada" }],
    );

    const funil = report.tables.find((t) => t.title === "Negócios por etapa");
    expect(funil?.rows[0]?.etapa).toBe("Avaliação agendada");
  });

  it("mede a primeira resposta pela mediana e ignora mensagem de robô", async () => {
    const at = (iso: string) => emSegundos(iso);
    const { report } = await relatorio(
      [
        { id: 1, status_id: 20, created_at: at("2026-02-03T09:00:00Z") },
        { id: 2, status_id: 20, created_at: at("2026-02-04T09:00:00Z") },
      ],
      [],
      {
        eventos: [
          // Lead 1: robô responde em 30s (created_by 0, deve ser ignorado);
          // atendente humano responde em 5 min. Uma saída anterior à mensagem
          // do lead (08:00) é de outra conversa e não pode contar.
          {
            type: "outgoing_chat_message",
            entity_type: "lead",
            entity_id: 1,
            created_by: 7,
            created_at: at("2026-02-03T08:00:00Z"),
          },
          {
            type: "incoming_chat_message",
            entity_type: "lead",
            entity_id: 1,
            created_at: at("2026-02-03T10:00:00Z"),
          },
          {
            type: "outgoing_chat_message",
            entity_type: "lead",
            entity_id: 1,
            created_by: 0,
            created_at: at("2026-02-03T10:00:30Z"),
          },
          {
            type: "outgoing_chat_message",
            entity_type: "lead",
            entity_id: 1,
            created_by: 7,
            created_at: at("2026-02-03T10:05:00Z"),
          },
          // Lead 2: resposta humana em 10 min.
          {
            type: "incoming_chat_message",
            entity_type: "lead",
            entity_id: 2,
            created_at: at("2026-02-04T09:00:00Z"),
          },
          {
            type: "outgoing_chat_message",
            entity_type: "lead",
            entity_id: 2,
            created_by: 7,
            created_at: at("2026-02-04T09:10:00Z"),
          },
        ],
      },
    );

    // Respostas de 300s e 600s → mediana 450. O robô (30s) não entra.
    expect(kpi(report, "primeiraResposta")).toBe(450);
  });

  it("sem evento de resposta, o KPI de primeira resposta não aparece e avisa", async () => {
    const { report } = await relatorio([
      { id: 1, status_id: 20, created_at: emSegundos("2026-02-03T10:00:00Z") },
    ]);

    expect(report.kpis.some((k) => k.key === "primeiraResposta")).toBe(false);
    expect(report.notices.some((n) => /primeira resposta/i.test(n.text))).toBe(true);
  });

  it("agrupa os motivos de perda pelo nome, com fatia do total perdido", async () => {
    const { report } = await relatorio(
      [
        {
          id: 1,
          status_id: PERDIDO,
          loss_reason_id: 10,
          created_at: emSegundos("2026-02-03T10:00:00Z"),
        },
        {
          id: 2,
          status_id: PERDIDO,
          loss_reason_id: 10,
          created_at: emSegundos("2026-02-04T10:00:00Z"),
        },
        {
          id: 3,
          status_id: PERDIDO,
          loss_reason_id: 20,
          created_at: emSegundos("2026-02-05T10:00:00Z"),
        },
        { id: 4, status_id: PERDIDO, created_at: emSegundos("2026-02-06T10:00:00Z") },
      ],
      [],
      {
        motivos: [
          { id: 10, name: "Preço" },
          { id: 20, name: "Sem retorno" },
        ],
      },
    );

    const tabela = report.tables.find((t) => t.title === "Motivos de perda");
    const preco = tabela?.rows.find((r) => r.motivo === "Preço");
    const semMotivo = tabela?.rows.find((r) => r.motivo === "Sem motivo registrado");

    expect(preco?.negocios).toBe(2);
    expect(preco?.fatia).toBeCloseTo(0.5, 6);
    expect(semMotivo?.negocios).toBe(1);
  });

  it("sem perda no período, a tabela de motivos não aparece", async () => {
    const { report } = await relatorio([
      { id: 1, price: 100, status_id: GANHO, created_at: emSegundos("2026-02-03T10:00:00Z") },
    ]);

    expect(report.tables.some((t) => t.title === "Motivos de perda")).toBe(false);
  });

  it("conta qualificação, agendamento e proposta pelo nome da etapa", async () => {
    const { report } = await relatorio(
      [
        { id: 1, status_id: 30, created_at: emSegundos("2026-02-03T10:00:00Z") },
        { id: 2, status_id: 30, created_at: emSegundos("2026-02-03T10:00:00Z") },
        { id: 3, status_id: 31, created_at: emSegundos("2026-02-03T10:00:00Z") },
        { id: 4, status_id: 32, created_at: emSegundos("2026-02-03T10:00:00Z") },
      ],
      [
        { id: 30, name: "Lead qualificado" },
        { id: 31, name: "Avaliação agendada" },
        { id: 32, name: "Proposta enviada" },
      ],
    );

    expect(kpi(report, "qualificados")).toBe(2);
    expect(kpi(report, "agendamentos")).toBe(1);
    expect(kpi(report, "propostas")).toBe(1);
  });

  it("o id em KOMMO_ETAPA_* vence o nome da etapa", async () => {
    // A etapa 55 tem nome que não casaria com nenhum papel; o override manda.
    vi.stubEnv("KOMMO_ETAPA_AGENDAMENTO", "55");
    const { report } = await relatorio(
      [{ id: 1, status_id: 55, created_at: emSegundos("2026-02-03T10:00:00Z") }],
      [{ id: 55, name: "Etapa X" }],
    );

    expect(kpi(report, "agendamentos")).toBe(1);
  });

  it("etapa de funil não reconhecida vira aviso, não KPI zerado", async () => {
    const { report } = await relatorio(
      [{ id: 1, status_id: 90, created_at: emSegundos("2026-02-03T10:00:00Z") }],
      [{ id: 90, name: "Etapa sem nome padrão" }],
    );

    expect(report.kpis.some((k) => k.key === "agendamentos")).toBe(false);
    expect(report.notices.some((n) => /não reconheci/i.test(n.text))).toBe(true);
  });

  it("sem credencial, cai em demonstração em vez de quebrar", async () => {
    vi.stubEnv("KOMMO_ACCESS_TOKEN", "");
    vi.resetModules();
    vi.stubGlobal("fetch", kommo([]));

    const { fetchVendasReport } = await import("@/server/connectors/kommo");
    const report = await fetchVendasReport(RANGE);

    expect(report.source).toBe("mock");
    expect(report.notices.some((n) => /demonstração/i.test(n.text))).toBe(true);
  });
});
