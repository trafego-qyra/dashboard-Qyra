import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sondarConversas } from "@/server/kommo/conversas";

/**
 * A sonda que descobre o que dá para ler de conversa no Kommo.
 *
 * A garantia central aqui não é de formato, é de contenção: **o texto da
 * conversa não pode sair na resposta**. A saída de um diagnóstico acaba colada
 * em conversa, tíquete e captura de tela, e conversa de paciente sobre
 * emagrecimento e injetável é dado sensível de saúde (LGPD, art. 11).
 *
 * O primeiro teste é o que justifica o módulo existir.
 */

const SEGREDO = "oi doutora, tomo Mounjaro ha tres meses e queria saber o preco";
const OUTRO_SEGREDO = "meu marido nao sabe que estou fazendo tratamento";

function notas() {
  return [
    {
      id: 1,
      note_type: "common",
      created_by: 9001,
      entity_id: 8842,
      params: { text: SEGREDO },
    },
    {
      id: 2,
      note_type: "common",
      created_by: 9002,
      entity_id: 8843,
      params: { text: OUTRO_SEGREDO },
    },
    { id: 3, note_type: "service_message", created_by: 0, entity_id: 8842, params: {} },
  ];
}

/** Um Kommo falso. `porCaminho` decide o que cada endpoint responde. */
function kommo(porCaminho: (caminho: string) => Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => porCaminho(String(input))),
  );
}

function comNotas() {
  kommo((url) => {
    if (url.includes("/leads/notes")) {
      return new Response(JSON.stringify({ _embedded: { notes: notas() } }), { status: 200 });
    }
    return new Response(null, { status: 204 });
  });
}

describe("sondarConversas", () => {
  beforeEach(() => {
    vi.stubEnv("KOMMO_SUBDOMAIN", "qyra");
    vi.stubEnv("KOMMO_ACCESS_TOKEN", "chave");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("não deixa o texto da conversa sair na resposta", async () => {
    comNotas();

    const inteiro = JSON.stringify(await sondarConversas());

    expect(inteiro).not.toContain(SEGREDO);
    expect(inteiro).not.toContain(OUTRO_SEGREDO);
    // Nem um pedaço: um trecho de trinta caracteres já identifica a pessoa.
    expect(inteiro).not.toContain("Mounjaro");
    expect(inteiro).not.toContain("meu marido");
  });

  it("diz onde a mensagem mora, com quantidade e tamanho", async () => {
    comNotas();

    const { endpoints } = await sondarConversas();
    const notasDeNegocio = endpoints.find((e) => e.nome === "notas-de-negocio");

    expect(notasDeNegocio?.status).toBe(200);
    expect(notasDeNegocio?.itens).toBe(3);
    expect(notasDeNegocio?.tipos).toEqual({ common: 2, service_message: 1 });
    expect(notasDeNegocio?.texto?.common.comTexto).toBe(2);
    expect(notasDeNegocio?.texto?.common.tamanhoMedio).toBeGreaterThan(0);
  });

  it("conta autores distintos, que é o que permite olhar por vendedor", async () => {
    comNotas();

    const { endpoints } = await sondarConversas();

    expect(endpoints.find((e) => e.nome === "notas-de-negocio")?.autoresDistintos).toBe(3);
  });

  it("lista os campos disponíveis, para desenhar o que vem depois", async () => {
    comNotas();

    const { endpoints } = await sondarConversas();
    const campos = endpoints.find((e) => e.nome === "notas-de-negocio")?.campos;

    expect(campos).toContain("note_type");
    expect(campos).toContain("created_by");
    // `params` aparece como nome de campo; o que está dentro dele, não.
    expect(campos).toContain("params");
  });

  it("separa coleção vazia de endpoint fechado", async () => {
    // 204 é o Kommo dizendo "existe, mas não tem nada" — e confundir isso com
    // permissão negada mandaria alguém caçar escopo que não falta.
    kommo((url) =>
      url.includes("/talks")
        ? new Response(null, { status: 204 })
        : new Response("Forbidden", { status: 403 }),
    );

    const { endpoints } = await sondarConversas();

    expect(endpoints.find((e) => e.nome === "conversas")).toMatchObject({ status: 204, itens: 0 });
    expect(endpoints.find((e) => e.nome === "notas-de-negocio")).toMatchObject({ status: 403 });
  });

  it("guarda o motivo da recusa, que é o que diz se vale insistir", async () => {
    kommo(() => new Response('{"title":"Forbidden","detail":"escopo ausente"}', { status: 403 }));

    const { endpoints, conclusao } = await sondarConversas();

    expect(endpoints[0]?.erro).toContain("escopo ausente");
    expect(conclusao).toMatch(/nenhum endpoint/i);
  });

  it("conclui que dá para medir tempo, mas não conteúdo, quando não há texto", async () => {
    kommo((url) =>
      url.includes("/talks")
        ? new Response(
            JSON.stringify({
              _embedded: {
                talks: [{ talk_id: 1, entity_id: 8842, responsible_user_id: 9001, is_read: true }],
              },
            }),
            { status: 200 },
          )
        : new Response(null, { status: 204 }),
    );

    const { conclusao } = await sondarConversas();

    expect(conclusao).toMatch(/tempo de resposta/i);
    expect(conclusao).toMatch(/aderência a script, não/i);
  });

  it("uma chamada que falha não derruba as outras", async () => {
    kommo((url) => {
      if (url.includes("/leads/notes")) throw new Error("conexão caiu");
      return new Response(null, { status: 204 });
    });

    const { endpoints } = await sondarConversas();

    expect(endpoints).toHaveLength(4);
    expect(endpoints.find((e) => e.nome === "notas-de-negocio")?.erro).toContain("conexão caiu");
  });
});
