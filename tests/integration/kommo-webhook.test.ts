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

/** O corpo exatamente como o Kommo entrega: formulário, não JSON. */
function corpoDoKommo(mudancas: Array<{ lead: number; etapa: number }>, tipo = "status"): string {
  const partes = ["account[id]=1", "account[subdomain]=qyra"];
  mudancas.forEach((m, i) => {
    partes.push(`leads[${tipo}][${i}][id]=${m.lead}`);
    partes.push(`leads[${tipo}][${i}][status_id]=${m.etapa}`);
    partes.push(`leads[${tipo}][${i}][pipeline_id]=555`);
  });
  return partes.join("&");
}

describe("lerMudancas", () => {
  it("lê o formulário aninhado do Kommo", () => {
    expect(lerMudancas(corpoDoKommo([{ lead: 8842, etapa: 142 }]))).toEqual([
      { leadId: 8842, statusId: 142 },
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
      { leadId: 1, statusId: 142 },
      { leadId: 2, statusId: 90210 },
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
  beforeEach(() => vi.stubEnv("KOMMO_ETAPA_QUALIFICADO", String(QUALIFICADO)));
  afterEach(() => vi.unstubAllEnvs());

  it("142 é venda ganha em toda conta do Kommo", () => {
    expect(nomeDoEvento(142)).toBe("Purchase");
  });

  it("a etapa configurada vira qualificação", () => {
    expect(nomeDoEvento(QUALIFICADO)).toBe("Qualificado");
  });

  it("as demais etapas não viram evento", () => {
    // Inclusive 143 (perdido): a Meta não tem o que fazer com uma perda.
    expect(nomeDoEvento(143)).toBeNull();
    expect(nomeDoEvento(11111)).toBeNull();
  });

  it("sem a etapa configurada, só a venda conta", () => {
    vi.stubEnv("KOMMO_ETAPA_QUALIFICADO", "");
    expect(nomeDoEvento(QUALIFICADO)).toBeNull();
    expect(nomeDoEvento(142)).toBe("Purchase");
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
    const [evento] = await eventosDaMudanca([{ leadId: 8842, statusId: 142 }]);

    expect(evento.identidade.telefone).toBe("(11) 99999-9999");
    expect(evento.identidade.email).toBe("ana@gmail.com");
    expect(evento.identidade.nome).toBe("Ana");
    expect(evento.identidade.sobrenome).toBe("Silva");
    // O `fbclid` mora no negócio, não no contato.
    expect(evento.identidade.clique).toBe("IwAR1abc");
  });

  it("gera id estável, para o reenvio do Kommo não contar duas vezes", async () => {
    kommo();
    const [primeiro] = await eventosDaMudanca([{ leadId: 8842, statusId: 142 }]);
    const [segundo] = await eventosDaMudanca([{ leadId: 8842, statusId: 142 }]);

    expect(primeiro.eventId).toBe("kommo-8842-142");
    expect(segundo.eventId).toBe(primeiro.eventId);
  });

  it("leva valor na venda", async () => {
    kommo();
    const [evento] = await eventosDaMudanca([{ leadId: 8842, statusId: 142 }]);
    expect(evento.valor).toBe(2500);
  });

  it("não leva valor na qualificação", async () => {
    // Na etapa intermediária o campo costuma ter a expectativa, não o que foi
    // pago — e mandar isso ensinaria a Meta a otimizar por um número inventado.
    kommo();
    const [evento] = await eventosDaMudanca([{ leadId: 8842, statusId: QUALIFICADO }]);

    expect(evento.eventName).toBe("Qualificado");
    expect(evento.valor).toBeNull();
  });

  it("ignora etapa que não interessa, sem nem consultar o Kommo", async () => {
    const chamadas = kommo();
    await expect(eventosDaMudanca([{ leadId: 8842, statusId: 143 }])).resolves.toEqual([]);
    expect(chamadas).not.toHaveBeenCalled();
  });

  it("segue sem o contato quando ele não vem", async () => {
    // O `fbc` do negócio sozinho já identifica. Meia identidade é melhor que
    // nenhuma, e quem decide se dá para enviar é o conector.
    kommo({ contatoFalha: true });
    const [evento] = await eventosDaMudanca([{ leadId: 8842, statusId: 142 }]);

    expect(evento.identidade.telefone).toBeNull();
    expect(evento.identidade.clique).toBe("IwAR1abc");
  });

  it("um negócio que a API não devolveu não derruba os outros", async () => {
    kommo({ leadFalha: true });
    await expect(eventosDaMudanca([{ leadId: 8842, statusId: 142 }])).resolves.toEqual([]);
  });
});
