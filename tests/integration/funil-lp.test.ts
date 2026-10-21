import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as funilPost } from "@/app/api/funil/route";
import { lerEtapa, montarFunil, registrarEtapa, resumoDoFunil } from "@/server/funil/lp";
import { resetRateLimit } from "@/server/lib/rate-limit";

/**
 * O funil do questionário das LPs de planos.
 *
 * A rota é pública e não tem senha possível: quem chama é o navegador de um
 * visitante. O que segura a porta é o formato do que se aceita e a origem —
 * e é isso que a maior parte destes testes exercita. O resto garante que o
 * desenho conte pessoas, e não telas vistas.
 */

const SESSAO = "0b6f3c2a-8d4e-4f1a-9c3b-2e7d5a6f8b90";

interface Chamada {
  url: string;
  metodo: string;
  corpo: string;
  prefer: string;
}

/** Um Supabase falso. `resumo` é o que ele devolve num GET. */
function banco(resumo: unknown[] = [], status = 200) {
  const chamadas: Chamada[] = [];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      chamadas.push({
        url: String(input),
        metodo: init?.method ?? "GET",
        corpo: String(init?.body ?? ""),
        prefer: headers.get("prefer") ?? "",
      });

      if ((init?.method ?? "GET") === "GET") {
        return new Response(JSON.stringify(resumo), {
          status,
          headers: { "content-type": "application/json" },
        });
      }

      return new Response(null, { status: 201 });
    }),
  );

  return chamadas;
}

function corpo(parcial: Record<string, unknown> = {}) {
  return { sessao: SESSAO, etapa: "objetivo", lp: "avancado", ...parcial };
}

describe("lerEtapa", () => {
  it("aceita uma etapa inteira", () => {
    expect(
      lerEtapa(corpo({ plano: "essencial", utm_source: "meta", utm_campaign: "fundo-sp" })),
    ).toEqual({
      sessao: SESSAO,
      etapa: "objetivo",
      lp: "avancado",
      plano: "essencial",
      clienteId: null,
      utmSource: "meta",
      utmMedium: null,
      utmCampaign: "fundo-sp",
      utmContent: null,
    });
  });

  it("recusa etapa fora da lista", () => {
    for (const etapa of ["", "pagou", "objetivo; drop table", "x".repeat(41)]) {
      expect(lerEtapa(corpo({ etapa }))).toBeNull();
    }
  });

  it("recusa LP desconhecida e sessão que não é UUID", () => {
    expect(lerEtapa(corpo({ lp: "outra" }))).toBeNull();
    for (const sessao of ["123", "", "' or 1=1 --", SESSAO.replace("-", "")]) {
      expect(lerEtapa(corpo({ sessao }))).toBeNull();
    }
  });

  it("descarta plano desconhecido sem recusar a etapa", () => {
    expect(lerEtapa(corpo({ plano: "premium" }))?.plano).toBeNull();
  });

  it("normaliza a sessão para minúsculas", () => {
    expect(lerEtapa(corpo({ sessao: SESSAO.toUpperCase() }))?.sessao).toBe(SESSAO);
  });
});

describe("registrarEtapa", () => {
  beforeEach(() => {
    vi.stubEnv("SUPABASE_URL", "https://banco.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "chave");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("insere ignorando a repetida, para voltar uma pergunta não contar duas vezes", async () => {
    const chamadas = banco();

    await registrarEtapa(lerEtapa(corpo({ utm_source: "meta" })) as never);

    const escrita = chamadas.find((c) => c.metodo === "POST");
    expect(escrita?.url).toContain("/funil_lp");
    expect(escrita?.prefer).toContain("ignore-duplicates");
    expect(JSON.parse(escrita?.corpo ?? "[]")[0]).toMatchObject({
      sessao: SESSAO,
      etapa: "objetivo",
      lp: "avancado",
      utm_source: "meta",
    });
  });

  it("não escreve nada sem banco configurado", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const chamadas = banco();

    await registrarEtapa(lerEtapa(corpo()) as never);

    expect(chamadas).toHaveLength(0);
  });
});

describe("montarFunil", () => {
  const periodo = { from: "2026-09-24", to: "2026-10-21" };
  const linha = (etapa: string, sessoes: number, dia = "2026-10-20", lp = "avancado") => ({
    dia,
    lp,
    etapa,
    sessoes,
  });

  it("soma dias e LPs por etapa", () => {
    const funil = montarFunil(
      [linha("visita", 60), linha("visita", 40, "2026-10-21", "essencial"), linha("inicio", 30)],
      periodo,
    );

    expect(funil?.bloco.stages[0]).toEqual({ label: "Visitou a LP", value: 100 });
    expect(funil?.bloco.stages[1]).toEqual({ label: "Abriu o questionário", value: 30 });
  });

  it("conta quem chegou à etapa ou passou dela", () => {
    // Quem volta ao questionário em outra aba pula telas já vistas; sem isto
    // o degrau de cima teria menos gente que o de baixo.
    const funil = montarFunil(
      [linha("visita", 10), linha("objetivo", 4), linha("corpo", 6)],
      periodo,
    );
    const valor = (rotulo: string) => funil?.bloco.stages.find((s) => s.label === rotulo)?.value;

    expect(valor("Abriu o questionário")).toBe(6);
    expect(valor("Objetivo")).toBe(6);
    expect(valor("Altura e peso")).toBe(6);
    expect(valor("Meta de peso")).toBe(0);
  });

  it("deixa as telas que nem todo mundo vê fora da figura, e separa as saídas", () => {
    const funil = montarFunil(
      [
        linha("visita", 10),
        linha("prontidao", 3),
        linha("saida_imc_adequado", 2),
        linha("saida_reprovado", 1),
      ],
      periodo,
    );

    expect(funil?.bloco.stages.some((s) => s.label.toLowerCase().includes("prontid"))).toBe(false);
    expect(funil?.saidas).toEqual({ imcBaixo: 0, imcAdequado: 2, reprovado: 1 });
  });

  it("aceita as etapas da contratação e conta os pagamentos aprovados", () => {
    for (const etapa of ["dados", "pagamento", "pago"])
      expect(lerEtapa(corpo({ etapa }))).not.toBeNull();
    const funil = montarFunil([linha("visita", 10), linha("pago", 2)], periodo);
    expect(funil?.pagos).toBe(2);
    expect(funil?.bloco.stages.some((s) => s.label.toLowerCase().includes("pag"))).toBe(false);
  });

  it("devolve null sem nenhuma etapa do funil", () => {
    expect(montarFunil([], periodo)).toBeNull();
    expect(montarFunil([linha("prontidao", 5)], periodo)).toBeNull();
  });
});

describe("resumoDoFunil", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("avisa que não há banco, em vez de fingir funil vazio", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");

    expect(await resumoDoFunil()).toEqual({ estado: "sem-banco" });
  });

  it("lê a view do período e monta o funil", async () => {
    vi.stubEnv("SUPABASE_URL", "https://banco.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "chave");
    const chamadas = banco([{ dia: "2026-10-20", lp: "digital", etapa: "visita", sessoes: 5 }]);

    const resultado = await resumoDoFunil();

    expect(chamadas[0]?.url).toContain("/funil_lp_por_dia");
    expect(decodeURIComponent(chamadas[0]?.url ?? "")).toMatch(
      /and=\(dia\.gte\.\d{4}-\d{2}-\d{2},dia\.lte\./,
    );
    expect(resultado.estado).toBe("ok");
  });

  it("diz quando o banco não respondeu", async () => {
    vi.stubEnv("SUPABASE_URL", "https://banco.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "chave");
    banco([], 404);

    expect((await resumoDoFunil()).estado).toBe("falhou");
  });
});

describe("POST /api/funil", () => {
  beforeEach(() => {
    resetRateLimit();
    vi.stubEnv("SUPABASE_URL", "https://banco.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "chave");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const pedir = (origem: string | null, conteudo: unknown = corpo()) =>
    funilPost(
      new Request("https://dashboard.qyra.com.br/api/funil", {
        method: "POST",
        headers: origem ? { origin: origem, "content-type": "text/plain" } : {},
        body: typeof conteudo === "string" ? conteudo : JSON.stringify(conteudo),
      }),
    );

  it("grava a etapa vinda da LP e libera a origem", async () => {
    const chamadas = banco();

    const resposta = await pedir("https://planos.qyra.com.br");

    expect(resposta.status).toBe(204);
    expect(resposta.headers.get("access-control-allow-origin")).toBe("https://planos.qyra.com.br");
    expect(chamadas.some((c) => c.metodo === "POST")).toBe(true);
  });

  it("aceita os previews do Cloudflare Pages", async () => {
    banco();

    expect((await pedir("https://claude-teste.qyra-lp.pages.dev")).status).toBe(204);
  });

  it("recusa outra origem e chamada sem origem", async () => {
    const chamadas = banco();

    expect((await pedir("https://qyra-lp.pages.dev.golpe.com")).status).toBe(403);
    expect((await pedir(null)).status).toBe(403);
    expect(chamadas).toHaveLength(0);
  });

  it("recusa etapa desconhecida e corpo que não é JSON", async () => {
    banco();

    expect((await pedir("https://planos.qyra.com.br", corpo({ etapa: "pagou" }))).status).toBe(422);
    expect((await pedir("https://planos.qyra.com.br", "{nao e json")).status).toBe(400);
  });

  it("recusa corpo acima do teto", async () => {
    banco();

    const grande = corpo({ utm_content: "x".repeat(3_000) });
    expect((await pedir("https://planos.qyra.com.br", grande)).status).toBe(413);
  });
});
