import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type EventoDeCrm, enviarEventosDeCrm, montarUsuario } from "@/server/connectors/meta-capi";

/**
 * Envio de eventos de CRM para a Meta.
 *
 * O único conector que escreve numa plataforma — e o único em que um erro
 * **não aparece**. A Meta responde 200 para carga malformada, para hash errado
 * e para evento sem identificador. O sintoma é atribuição que não acontece,
 * semanas depois, sem nada no log. Por isso o que está testado aqui é
 * principalmente o formato, e não o caminho feliz.
 *
 * Os hashes são valores de referência calculados fora do projeto: conferir
 * contra `createHash` aqui dentro só provaria que a função chama a si mesma.
 */

const SHA = {
  email: "8ff54eeab415dc1a98c472d605195268015352a8b462ab174fe2525b1460e9d6",
  telefone: "a869177964cc68954ffec997bbad30769f8a5a6fdc60f296ddbc60b9347dc416",
  nome: "24d4b96f58da6d4a8512313bbd02a28ebf0ca95dec6e4c86ef78ce7f01e788ac",
  sobrenome: "d24e913a4107af875dc2ac3d419798f3794d00434e5059fbb68ac8d33626eaee",
};

const CRIADO_EM = 1_758_000_000_000;

function evento(parcial: Partial<EventoDeCrm> = {}): EventoDeCrm {
  return {
    eventName: "VendaGanha",
    eventTime: 1_758_000_000,
    eventId: "kommo-1",
    identidade: { telefone: "5511999999999", criadoEmMs: CRIADO_EM },
    ...parcial,
  };
}

/** Captura o corpo enviado, que é o que de fato importa neste conector. */
function capturar(resposta: unknown = { events_received: 1, fbtrace_id: "rastreio" }) {
  const chamadas = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => {
    return new Response(JSON.stringify(resposta), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", chamadas);
  return chamadas;
}

function corpoEnviado(chamadas: ReturnType<typeof capturar>, indice = 0) {
  return JSON.parse(String(chamadas.mock.calls[indice]?.[1]?.body));
}

beforeEach(() => {
  vi.stubEnv("META_CAPI_DATASET_ID", "1496242995619330");
  vi.stubEnv("META_CAPI_ACCESS_TOKEN", "token-do-conjunto");
  vi.stubEnv("META_CAPI_API_VERSION", "v26.0");
  vi.stubEnv("META_CAPI_TEST_EVENT_CODE", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("montarUsuario", () => {
  it("converte contato em hash e deixa identificador de clique cru", () => {
    const usuario = montarUsuario({
      email: " Maria@Gmail.COM ",
      telefone: "(11) 99999-9999",
      nome: "Ana",
      sobrenome: "Silva",
      clique: "fb.1.1750000000000.IwAR1abc",
      navegador: "fb.1.1750000000000.9999",
      criadoEmMs: CRIADO_EM,
    });

    expect(usuario).toEqual({
      em: [SHA.email],
      ph: [SHA.telefone],
      fn: [SHA.nome],
      ln: [SHA.sobrenome],
      // Hashear estes dois é o erro clássico: a Meta não reconhece e a
      // atribuição some sem nenhum aviso.
      fbc: "fb.1.1750000000000.IwAR1abc",
      fbp: "fb.1.1750000000000.9999",
    });
  });

  it("devolve nulo quando não há em que a Meta se agarre", () => {
    // O lead de DM que nunca deixou contato. Mandar assim entraria na conta de
    // eventos sem correspondência e derrubaria a qualidade do conjunto todo.
    expect(montarUsuario({ criadoEmMs: CRIADO_EM })).toBeNull();
  });

  it("não aceita nome sozinho como identificação", () => {
    expect(montarUsuario({ nome: "Ana", sobrenome: "Silva", criadoEmMs: CRIADO_EM })).toBeNull();
  });

  it("não aceita o cookie de navegador sozinho", () => {
    // `_fbp` identifica um navegador, não uma pessoa.
    expect(
      montarUsuario({ navegador: "fb.1.1750000000000.9999", criadoEmMs: CRIADO_EM }),
    ).toBeNull();
  });

  it("descarta o id do próprio Kommo colado no campo de lead_id", () => {
    // 7 dígitos: id do Kommo, não da Meta. Não casa com nada do lado de lá.
    const usuario = montarUsuario({
      telefone: "5511999999999",
      leadId: "8842911",
      criadoEmMs: CRIADO_EM,
    });
    expect(usuario?.lead_id).toBeUndefined();
  });

  it("aceita o lead_id da Meta como número", () => {
    const usuario = montarUsuario({
      leadId: "1234567890123456",
      criadoEmMs: CRIADO_EM,
    });
    expect(usuario?.lead_id).toBe(1_234_567_890_123_456);
  });

  it("preserva em texto o lead_id de 17 dígitos", () => {
    // Acima de Number.MAX_SAFE_INTEGER a conversão trocaria o último dígito em
    // silêncio, e o evento casaria com outro lead ou com nenhum.
    const usuario = montarUsuario({ leadId: "12345678901234567", criadoEmMs: CRIADO_EM });
    expect(usuario?.lead_id).toBe("12345678901234567");
  });
});

describe("enviarEventosDeCrm", () => {
  it("manda os três campos fixos que a instrução da Meta exige", async () => {
    const chamadas = capturar();
    await enviarEventosDeCrm([evento()]);

    const [item] = corpoEnviado(chamadas).data;
    expect(item.action_source).toBe("system_generated");
    expect(item.custom_data.event_source).toBe("crm");
    expect(item.custom_data.lead_event_source).toBe("Kommo");
  });

  it("vai para o conjunto e a versão configurados, com o token fora da URL", async () => {
    const chamadas = capturar();
    await enviarEventosDeCrm([evento()]);

    const [url, init] = chamadas.mock.calls[0];
    expect(String(url)).toBe("https://graph.facebook.com/v26.0/1496242995619330/events");
    expect(String(url)).not.toContain("token-do-conjunto");
    const cabecalhos = init?.headers as Record<string, string> | undefined;
    expect(cabecalhos?.authorization).toBe("Bearer token-do-conjunto");
  });

  it("inclui o código de teste quando ele está configurado", async () => {
    vi.stubEnv("META_CAPI_TEST_EVENT_CODE", "TEST12345");
    const chamadas = capturar();
    await enviarEventosDeCrm([evento()]);

    expect(corpoEnviado(chamadas).test_event_code).toBe("TEST12345");
  });

  it("não manda código de teste quando ele está vazio", async () => {
    const chamadas = capturar();
    await enviarEventosDeCrm([evento()]);

    expect(corpoEnviado(chamadas)).not.toHaveProperty("test_event_code");
  });

  it("leva valor e moeda só quando há valor de verdade", async () => {
    const chamadas = capturar();
    await enviarEventosDeCrm([evento({ valor: 2500 })]);

    const [item] = corpoEnviado(chamadas).data;
    expect(item.custom_data.value).toBe(2500);
    expect(item.custom_data.currency).toBe("BRL");
  });

  it("omite o valor quando o negócio está sem valor preenchido", async () => {
    // O funil do Kommo hoje vem com R$ 0 na maioria dos negócios. Mandar zero
    // ensinaria a Meta a otimizar para venda que não vale nada.
    const chamadas = capturar();
    await enviarEventosDeCrm([evento({ valor: 0 })]);

    const [item] = corpoEnviado(chamadas).data;
    expect(item.custom_data).not.toHaveProperty("value");
    expect(item.custom_data).not.toHaveProperty("currency");
  });

  it("separa quem não tem identificador em vez de mandar evento vazio", async () => {
    const chamadas = capturar();
    const resultado = await enviarEventosDeCrm([
      evento({ eventId: "com-telefone" }),
      evento({ eventId: "sem-nada", identidade: { criadoEmMs: CRIADO_EM } }),
    ]);

    expect(resultado.enviados).toEqual(["com-telefone"]);
    expect(resultado.semIdentificador).toEqual(["sem-nada"]);
    expect(corpoEnviado(chamadas).data).toHaveLength(1);
  });

  it("não chama a Meta quando nenhum evento é enviável", async () => {
    const chamadas = capturar();
    const resultado = await enviarEventosDeCrm([
      evento({ eventId: "sem-nada", identidade: { criadoEmMs: CRIADO_EM } }),
    ]);

    expect(chamadas).not.toHaveBeenCalled();
    expect(resultado.recebidos).toBe(0);
    expect(resultado.semIdentificador).toEqual(["sem-nada"]);
  });

  it("devolve o rastreio, que é o que o suporte da Meta pede", async () => {
    capturar({ events_received: 1, fbtrace_id: "AbC123" });
    const resultado = await enviarEventosDeCrm([evento()]);

    expect(resultado.recebidos).toBe(1);
    expect(resultado.rastreio).toEqual(["AbC123"]);
  });

  it("quebra em lotes acima do teto da API", async () => {
    const chamadas = capturar();
    const muitos = Array.from({ length: 1_001 }, (_, n) => evento({ eventId: `kommo-${n}` }));

    await enviarEventosDeCrm(muitos);

    expect(chamadas).toHaveBeenCalledTimes(2);
    expect(corpoEnviado(chamadas, 0).data).toHaveLength(1_000);
    expect(corpoEnviado(chamadas, 1).data).toHaveLength(1);
  });

  it("recusa sem credencial em vez de montar requisição para lugar nenhum", async () => {
    vi.stubEnv("META_CAPI_ACCESS_TOKEN", "");
    const chamadas = capturar();

    await expect(enviarEventosDeCrm([evento()])).rejects.toThrow(/META_CAPI_ACCESS_TOKEN/);
    expect(chamadas).not.toHaveBeenCalled();
  });
});
