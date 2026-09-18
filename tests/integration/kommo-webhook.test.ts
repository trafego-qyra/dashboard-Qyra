import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { eventosDaMudanca, lerMudancas, nomeDoEvento } from "@/server/kommo/webhook";

/**
 * O gatilho: mudança de etapa no Kommo vira evento para a Meta.
 *
 * O que torna este módulo arriscado é o formato. O Kommo herdou do amoCRM um
 * corpo de formulário com chaves aninhadas, e dispara webhook para **qualquer**
 * edição do negócio — inclusive correção de nome. Ler errado aqui significa ou
 * perder venda, ou mandar evento a cada vez que alguém encosta no registro.
 */

const QUALIFICADO = 90210;
const FUNIL = 14120879;
const OUTRO_FUNIL = 14308259;

/** O corpo exatamente como o Kommo entrega: formulário, não JSON. */
function corpoDoKommo(
  mudancas: Array<{ lead: number; etapa: number; funil?: number }>,
  tipo = "status",
): string {
  const partes = ["account[id]=1", "account[subdomain]=qyra"];
  mudancas.forEach((m, i) => {
    partes.push(`leads[${tipo}][${i}][id]=${m.lead}`);
    partes.push(`leads[${tipo}][${i}][status_id]=${m.etapa}`);
    partes.push(`leads[${tipo}][${i}][pipeline_id]=${m.funil ?? FUNIL}`);
  });
  return partes.join("&");
}

describe("lerMudancas", () => {
  it("lê o formulário aninhado do Kommo", () => {
    expect(lerMudancas(corpoDoKommo([{ lead: 8842, etapa: 142 }]))).toEqual([
      { leadId: 8842, statusId: 142, pipelineId: FUNIL },
    ]);
  });

  it("lê várias mudanças na mesma entrega", () => {
    expect(
      lerMudancas(
        corpoDoKommo([
          { lead: 1, etapa: 142 },
          { lead: 2, etapa: 90210 },
        ]),
      ),
    ).toEqual([
      { leadId: 1, statusId: 142, pipelineId: FUNIL },
      { leadId: 2, statusId: 90210, pipelineId: FUNIL },
    ]);
  });

  it("ignora edição que não é mudança de etapa", () => {
    // `leads[update]` dispara quando alguém corrige um nome. Tratar isso como
    // mudança de etapa mandaria evento a cada toque no registro.
    expect(lerMudancas(corpoDoKommo([{ lead: 8842, etapa: 142 }], "update"))).toEqual([]);
    expect(lerMudancas(corpoDoKommo([{ lead: 8842, etapa: 142 }], "add"))).toEqual([]);
  });

  it("descarta entrada incompleta em vez de inventar", () => {
    expect(lerMudancas("leads[status][0][id]=8842")).toEqual([]);
    expect(lerMudancas("")).toEqual([]);
  });
});

describe("nomeDoEvento", () => {
  const mudanca = (statusId: number, pipelineId: number | null = FUNIL) => ({
    leadId: 1,
    statusId,
    pipelineId,
  });

  beforeEach(() => {
    vi.stubEnv("KOMMO_ETAPA_QUALIFICADO", String(QUALIFICADO));
    vi.stubEnv("KOMMO_PIPELINE_ID", String(FUNIL));
  });
  afterEach(() => vi.unstubAllEnvs());

  it("142 é venda ganha em toda conta do Kommo", () => {
    expect(nomeDoEvento(mudanca(142))).toBe("Purchase");
  });

  it("a etapa configurada vira qualificação", () => {
    expect(nomeDoEvento(mudanca(QUALIFICADO))).toBe("Qualificado");
  });

  it("as demais etapas não viram evento", () => {
    // Inclusive 143 (perdido): a Meta não tem o que fazer com uma perda.
    expect(nomeDoEvento(mudanca(143))).toBeNull();
    expect(nomeDoEvento(mudanca(11111))).toBeNull();
  });

  it("142 de OUTRO funil não é venda", () => {
    // A conta da clínica tem dois funis. No de vendas o 142 é "GANHO"; no de
    // clientes, é "Arquivo". Sem conferir o funil, arquivar um cliente viraria
    // uma venda inventada na Meta -- e ninguém desconfiaria, porque só sobe.
    expect(nomeDoEvento(mudanca(142, OUTRO_FUNIL))).toBeNull();
    expect(nomeDoEvento(mudanca(QUALIFICADO, OUTRO_FUNIL))).toBeNull();
  });

  it("sem funil configurado, qualquer um passa", () => {
    // Comportamento antigo, preservado: é o mesmo que o relatório de Vendas já
    // faz quando KOMMO_PIPELINE_ID está vazio.
    vi.stubEnv("KOMMO_PIPELINE_ID", "");
    expect(nomeDoEvento(mudanca(142, OUTRO_FUNIL))).toBe("Purchase");
  });

  it("sem a etapa configurada, só a venda conta", () => {
    vi.stubEnv("KOMMO_ETAPA_QUALIFICADO", "");
    expect(nomeDoEvento(mudanca(QUALIFICADO))).toBeNull();
    expect(nomeDoEvento(mudanca(142))).toBe("Purchase");
  });
});

describe("eventosDaMudanca", () => {
  const lead = {
    id: 8842,
    price: 2500,
    created_at: 1_757_000_000,
    custom_fields_values: [{ field_name: "fbclid", values: [{ value: "IwAR1abc" }] }],
    _embedded: { contacts: [{ id: 77, is_main: true }] },
  };

  const contato = {
    id: 77,
    first_name: "Ana",
    last_name: "Silva",
    custom_fields_values: [
      { field_code: "PHONE", values: [{ value: "(11) 99999-9999" }] },
      { field_code: "EMAIL", values: [{ value: "ana@gmail.com" }] },
    ],
  };

  function kommo(opcoes: { leadFalha?: boolean; contatoFalha?: boolean } = {}) {
    const chamadas = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const falhou = new Response("{}", { status: 500, statusText: "Server Error" });

      if (url.includes("/contacts/")) {
        return opcoes.contatoFalha
          ? falhou
          : new Response(JSON.stringify(contato), { status: 200 });
      }
      return opcoes.leadFalha ? falhou : new Response(JSON.stringify(lead), { status: 200 });
    });
    vi.stubGlobal("fetch", chamadas);
    return chamadas;
  }

  beforeEach(() => {
    vi.stubEnv("KOMMO_SUBDOMAIN", "qyra");
    vi.stubEnv("KOMMO_ACCESS_TOKEN", "chave");
    vi.stubEnv("KOMMO_ETAPA_QUALIFICADO", String(QUALIFICADO));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("junta identidade do negócio e do contato", async () => {
    kommo();
    const [evento] = await eventosDaMudanca([{ leadId: 8842, statusId: 142, pipelineId: FUNIL }]);

    expect(evento.identidade.telefone).toBe("(11) 99999-9999");
    expect(evento.identidade.email).toBe("ana@gmail.com");
    expect(evento.identidade.nome).toBe("Ana");
    expect(evento.identidade.sobrenome).toBe("Silva");
    // O `fbclid` mora no negócio, não no contato.
    expect(evento.identidade.clique).toBe("IwAR1abc");
  });

  it("gera id estável, para o reenvio do Kommo não contar duas vezes", async () => {
    kommo();
    const [primeiro] = await eventosDaMudanca([{ leadId: 8842, statusId: 142, pipelineId: FUNIL }]);
    const [segundo] = await eventosDaMudanca([{ leadId: 8842, statusId: 142, pipelineId: FUNIL }]);

    expect(primeiro.eventId).toBe("kommo-8842-142");
    expect(segundo.eventId).toBe(primeiro.eventId);
  });

  it("leva valor na venda", async () => {
    kommo();
    const [evento] = await eventosDaMudanca([{ leadId: 8842, statusId: 142, pipelineId: FUNIL }]);
    expect(evento.valor).toBe(2500);
  });

  it("não leva valor na qualificação", async () => {
    // Na etapa intermediária o campo costuma ter a expectativa, não o que foi
    // pago — e mandar isso ensinaria a Meta a otimizar por um número inventado.
    kommo();
    const [evento] = await eventosDaMudanca([
      { leadId: 8842, statusId: QUALIFICADO, pipelineId: FUNIL },
    ]);

    expect(evento.eventName).toBe("Qualificado");
    expect(evento.valor).toBeNull();
  });

  it("ignora etapa que não interessa, sem nem consultar o Kommo", async () => {
    const chamadas = kommo();
    await expect(
      eventosDaMudanca([{ leadId: 8842, statusId: 143, pipelineId: FUNIL }]),
    ).resolves.toEqual([]);
    expect(chamadas).not.toHaveBeenCalled();
  });

  it("segue sem o contato quando ele não vem", async () => {
    // O `fbc` do negócio sozinho já identifica. Meia identidade é melhor que
    // nenhuma, e quem decide se dá para enviar é o conector.
    kommo({ contatoFalha: true });
    const [evento] = await eventosDaMudanca([{ leadId: 8842, statusId: 142, pipelineId: FUNIL }]);

    expect(evento.identidade.telefone).toBeNull();
    expect(evento.identidade.clique).toBe("IwAR1abc");
  });

  it("um negócio que a API não devolveu não derruba os outros", async () => {
    kommo({ leadFalha: true });
    await expect(
      eventosDaMudanca([{ leadId: 8842, statusId: 142, pipelineId: FUNIL }]),
    ).resolves.toEqual([]);
  });
});

/**
 * A ponte de captura, vista de dentro do webhook.
 *
 * O campo do negócio vem **primeiro**, sempre. A ponte é um desvio construído
 * porque o questionário não grava o `fbc` no Kommo; no dia em que gravar, ela
 * precisa sair de cena sozinha, sem ninguém lembrar de desligá-la.
 */
describe("eventosDaMudanca com a ponte de captura", () => {
  const FUNIL = 14120879;
  const CLIENTE = "bfaa05dd-6946-4ac0-9500-cbd312b47907";
  const DA_PONTE = "fb.1.1758000000000.IwAR_daponte";

  function mundo(opcoes: { cliqueNoNegocio?: string; naPonte?: unknown[] } = {}) {
    const campos: Array<{ field_name: string; values: Array<{ value: string }> }> = [
      { field_name: "qyra_cliente_id", values: [{ value: CLIENTE }] },
    ];
    if (opcoes.cliqueNoNegocio) {
      campos.push({ field_name: "fbc", values: [{ value: opcoes.cliqueNoNegocio }] });
    }

    const chamadas: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        chamadas.push(url);

        if (url.includes("captura_clique")) {
          return new Response(JSON.stringify(opcoes.naPonte ?? []), { status: 200 });
        }
        if (url.includes("/contacts/")) {
          return new Response(JSON.stringify({ id: 77, first_name: "Ana" }), { status: 200 });
        }
        return new Response(
          JSON.stringify({
            id: 8842,
            price: 2500,
            created_at: 1_758_000_000,
            custom_fields_values: campos,
            _embedded: { contacts: [{ id: 77, is_main: true }] },
          }),
          { status: 200 },
        );
      }),
    );
    return chamadas;
  }

  beforeEach(() => {
    vi.stubEnv("KOMMO_SUBDOMAIN", "qyra");
    vi.stubEnv("KOMMO_ACCESS_TOKEN", "chave");
    vi.stubEnv("SUPABASE_URL", "https://banco.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "chave");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("resgata o clique pela ponte quando o negócio não traz nenhum", async () => {
    mundo({ naPonte: [{ cliente_id: CLIENTE, fbc: DA_PONTE, fbp: null }] });
    const [evento] = await eventosDaMudanca([{ leadId: 8842, statusId: 142, pipelineId: FUNIL }]);

    expect(evento.identidade.clique).toBe(DA_PONTE);
  });

  it("não consulta a ponte quando o negócio já traz o clique", async () => {
    // É o que faz a ponte se aposentar sozinha no dia em que o questionário
    // passar a gravar o campo.
    const chamadas = mundo({ cliqueNoNegocio: "fb.1.1758000000000.doNegocio" });
    const [evento] = await eventosDaMudanca([{ leadId: 8842, statusId: 142, pipelineId: FUNIL }]);

    expect(evento.identidade.clique).toBe("fb.1.1758000000000.doNegocio");
    expect(chamadas.some((u) => u.includes("captura_clique"))).toBe(false);
  });

  it("segue sem clique quando a ponte não tem aquele cliente", async () => {
    mundo({ naPonte: [] });
    const [evento] = await eventosDaMudanca([{ leadId: 8842, statusId: 142, pipelineId: FUNIL }]);

    expect(evento.identidade.clique).toBeNull();
    expect(evento.eventName).toBe("Purchase");
  });
});
