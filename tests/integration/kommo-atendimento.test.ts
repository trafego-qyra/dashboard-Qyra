import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { medirAtendimento } from "@/server/kommo/atendimento";

/**
 * Tempo de resposta do atendimento.
 *
 * O Kommo mostra uma média — "73s" — no mesmo painel em que há doze conversas
 * sem resposta e alguém esperando há trinta e três dias. Os testes daqui
 * existem para provar que este módulo não repete o truque: o que não foi
 * respondido **não entra** na conta central, e um caso extremo não afunda a
 * mediana.
 */

const PERIODO = { from: "2026-09-01", to: "2026-09-07" };

/** Um instante dentro da janela, em segundos. */
function em(dia: number, hora: number, minuto = 0): number {
  const iso = `2026-09-0${dia}T${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}:00Z`;
  return Date.parse(iso) / 1000;
}

function entrada(entidade: number, quando: number) {
  return { type: "incoming_chat_message", entity_id: entidade, created_at: quando, created_by: 0 };
}

function saida(entidade: number, quando: number, usuario = 9001) {
  return {
    type: "outgoing_chat_message",
    entity_id: entidade,
    created_at: quando,
    created_by: usuario,
  };
}

interface Chamada {
  url: string;
}

/** Um Kommo falso. `eventos` é o que `/events` devolve. */
function kommo(eventos: unknown[], notas: unknown[] = []) {
  const chamadas: Chamada[] = [];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      chamadas.push({ url });

      if (url.includes("/events")) {
        return eventos.length === 0
          ? new Response(null, { status: 204 })
          : new Response(JSON.stringify({ _embedded: { events: eventos } }), { status: 200 });
      }
      return notas.length === 0
        ? new Response(null, { status: 204 })
        : new Response(JSON.stringify({ _embedded: { notes: notas } }), { status: 200 });
    }),
  );

  return chamadas;
}

describe("medirAtendimento", () => {
  beforeEach(() => {
    vi.stubEnv("KOMMO_SUBDOMAIN", "qyra");
    vi.stubEnv("KOMMO_ACCESS_TOKEN", "chave");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("mede a espera entre a mensagem do lead e a resposta", async () => {
    kommo([entrada(1, em(2, 10, 0)), saida(1, em(2, 10, 5))]);

    const medido = await medirAtendimento(PERIODO);

    expect(medido.respondidas).toBe(1);
    expect(medido.medianaSegundos).toBe(300);
    expect(medido.semResposta).toBe(0);
  });

  it("um caso extremo não afunda a mediana", async () => {
    // É o defeito da média do Kommo, reproduzido de propósito: quatro respostas
    // rápidas e uma de dez horas. A média daria mais de duas horas; a mediana
    // continua contando o dia normal.
    kommo([
      entrada(1, em(2, 9)),
      saida(1, em(2, 9, 1)),
      entrada(2, em(2, 10)),
      saida(2, em(2, 10, 2)),
      entrada(3, em(2, 11)),
      saida(3, em(2, 11, 1)),
      entrada(4, em(2, 12)),
      saida(4, em(2, 12, 3)),
      entrada(5, em(3, 8)),
      saida(5, em(3, 18)),
    ]);

    const medido = await medirAtendimento(PERIODO);

    expect(medido.medianaSegundos).toBe(120);
    // O caso extremo não some: ele é o p90.
    expect(medido.p90Segundos).toBeGreaterThan(10_000);
  });

  it("conversa sem resposta não entra na mediana, e aparece separada", async () => {
    const agora = Date.parse("2026-09-08T12:00:00Z");
    kommo([entrada(1, em(2, 10)), saida(1, em(2, 10, 1)), entrada(2, em(2, 11))]);

    const medido = await medirAtendimento(PERIODO, agora);

    expect(medido.respondidas).toBe(1);
    expect(medido.medianaSegundos).toBe(60);
    expect(medido.semResposta).toBe(1);
    expect(medido.maiorEsperaAbertaSegundos).toBeGreaterThan(80_000);
  });

  it("cinco mensagens seguidas do lead são uma espera, não cinco", async () => {
    // Contar cinco premiaria quem demora: as quatro repetições entrariam com
    // espera cada vez menor e puxariam a mediana para baixo.
    kommo([
      entrada(1, em(2, 10, 0)),
      entrada(1, em(2, 10, 1)),
      entrada(1, em(2, 10, 2)),
      entrada(1, em(2, 10, 3)),
      entrada(1, em(2, 10, 4)),
      saida(1, em(2, 10, 30)),
    ]);

    const medido = await medirAtendimento(PERIODO);

    expect(medido.respondidas).toBe(1);
    expect(medido.medianaSegundos).toBe(1_800);
  });

  it("resposta no dia seguinte ao fim da janela ainda conta como respondida", async () => {
    // Sem a folga, a conversa da virada entraria como abandonada e o número
    // pioraria no fim de todo período por motivo nenhum.
    kommo([
      { type: "incoming_chat_message", entity_id: 1, created_at: em(7, 23, 50), created_by: 0 },
      { type: "outgoing_chat_message", entity_id: 1, created_at: em(8, 8, 0), created_by: 9001 },
    ]);

    const medido = await medirAtendimento(PERIODO);

    expect(medido.semResposta).toBe(0);
    expect(medido.respondidas).toBe(1);
  });

  it("mensagem que chega depois da janela não abre espera nova", async () => {
    // Ela veio junto na folga só para fechar par. Contá-la traria conversa do
    // período seguinte para dentro deste.
    kommo([
      { type: "incoming_chat_message", entity_id: 9, created_at: em(8, 10, 0), created_by: 0 },
    ]);

    const medido = await medirAtendimento(PERIODO);

    expect(medido.conversas).toBe(0);
    expect(medido.semResposta).toBe(0);
  });

  it("separa por vendedor, que é o que permite conversa individual", async () => {
    kommo([
      entrada(1, em(2, 10)),
      saida(1, em(2, 10, 1), 9001),
      entrada(2, em(2, 11)),
      saida(2, em(2, 11, 1), 9001),
      entrada(3, em(2, 12)),
      saida(3, em(2, 13), 9002),
    ]);

    const { porUsuario } = await medirAtendimento(PERIODO);

    expect(porUsuario[0]).toEqual({ usuarioId: "9001", respostas: 2, medianaSegundos: 60 });
    expect(porUsuario[1]).toEqual({ usuarioId: "9002", respostas: 1, medianaSegundos: 3_600 });
  });

  it("agrupa por hora no fuso da clínica, não em UTC", async () => {
    // 12:00 UTC é 09:00 em São Paulo. Errar isso jogaria a madrugada para o
    // meio da tarde e apagaria justamente o achado que motivou a métrica.
    kommo([entrada(2, em(2, 12, 0)), saida(2, em(2, 12, 5))]);

    const { porHora } = await medirAtendimento(PERIODO);

    expect(porHora).toHaveLength(1);
    expect(porHora[0]?.hora).toBe(9);
  });

  it("cai nas notas quando os eventos não trazem mensagem", async () => {
    kommo(
      [{ type: "lead_status_changed", entity_id: 1, created_at: em(2, 10), created_by: 9001 }],
      [
        { note_type: "chat_message", entity_id: 1, created_at: em(2, 10), created_by: 0 },
        { note_type: "chat_message", entity_id: 1, created_at: em(2, 10, 2), created_by: 9001 },
      ],
    );

    const medido = await medirAtendimento(PERIODO);

    expect(medido.fonte).toBe("notas");
    expect(medido.medianaSegundos).toBe(120);
  });

  it("nota interna da equipe não vira resposta", async () => {
    // `common` é anotação de quem trabalha o negócio, não mensagem ao lead.
    // Contá-la inventaria atendimento que nunca aconteceu.
    kommo(
      [],
      [
        { note_type: "chat_message", entity_id: 1, created_at: em(2, 10), created_by: 0 },
        { note_type: "common", entity_id: 1, created_at: em(2, 10, 1), created_by: 9001 },
      ],
    );

    const medido = await medirAtendimento(PERIODO, Date.parse("2026-09-08T12:00:00Z"));

    expect(medido.respondidas).toBe(0);
    expect(medido.semResposta).toBe(1);
  });

  it("manda o período na consulta ao Kommo, com folga para parear", async () => {
    const chamadas = kommo([entrada(1, em(2, 10)), saida(1, em(2, 10, 1))]);

    await medirAtendimento(PERIODO);

    const consulta = new URL(chamadas[0]?.url ?? "https://x/");
    expect(consulta.searchParams.get("filter[created_at][from]")).toBe(
      String(Date.parse("2026-09-01T00:00:00Z") / 1000),
    );
    // Fim do dia 7 mais dois dias de folga.
    expect(Number(consulta.searchParams.get("filter[created_at][to]"))).toBe(
      Date.parse("2026-09-07T23:59:59Z") / 1000 + 2 * 86_400,
    );
  });

  it("diz que não mediu, em vez de devolver zero, quando nada responde", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Forbidden", { status: 403 })),
    );

    const medido = await medirAtendimento(PERIODO);

    expect(medido.fonte).toBeNull();
    expect(medido.medianaSegundos).toBeNull();
    expect(medido.observacao).toMatch(/nenhuma fonte/i);
  });
});
