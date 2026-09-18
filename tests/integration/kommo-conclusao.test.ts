import { describe, expect, it } from "vitest";

import type { Captura } from "@/server/kommo/captura";
import {
  type EstadoConfigurado,
  type FunilDoKommo,
  montarConclusao,
} from "@/server/kommo/conclusao";

/**
 * A frase de abertura do diagnóstico do Kommo.
 *
 * Antes era um texto fixo mandando cadastrar `KOMMO_ETAPA_QUALIFICADO`, que
 * continuava aparecendo depois de a etapa estar cadastrada e correta — e mandava
 * refazer o que já estava feito. O caso que importa aqui é justamente esse: com
 * tudo configurado, a conclusão precisa **parar de pedir configuração**.
 */

const VENDAS: FunilDoKommo = {
  id: 14120879,
  nome: "FUNIL DE VENDAS",
  etapas: [
    { id: 109648867, nome: "NOVO LEAD" },
    { id: 109648871, nome: "QUALIFICAÇÃO" },
    { id: 142, nome: "GANHO" },
  ],
};

const CLIENTES: FunilDoKommo = {
  id: 14308259,
  nome: "FUNIL DE CLIENTES",
  etapas: [
    { id: 110501711, nome: "CLIENTES ATIVOS" },
    { id: 142, nome: "Arquivo" },
  ],
};

const COMPLETO: EstadoConfigurado = {
  pipelineId: "14120879",
  etapaQualificado: "109648871",
  temSegredoDoWebhook: true,
};

function captura(valores: Partial<Captura> = {}): Captura {
  return { amostra: 50, comClique: 7, comNavegador: 7, comUtm: 7, camposVistos: [], ...valores };
}

describe("montarConclusao", () => {
  it("não pede configuração quando está tudo configurado", () => {
    const frase = montarConclusao(COMPLETO, [VENDAS, CLIENTES], captura());

    expect(frase).not.toMatch(/cadastre|escolha a etapa/i);
    expect(frase).toContain("QUALIFICAÇÃO");
    expect(frase).toContain("FUNIL DE VENDAS");
  });

  it("pede o funil antes da etapa", () => {
    const frase = montarConclusao(
      { ...COMPLETO, pipelineId: undefined, etapaQualificado: undefined },
      [VENDAS],
      null,
    );

    expect(frase).toContain("KOMMO_PIPELINE_ID");
    expect(frase).not.toContain("KOMMO_ETAPA_QUALIFICADO");
  });

  it("acusa funil que não existe na conta em vez de segui-lo", () => {
    const frase = montarConclusao({ ...COMPLETO, pipelineId: "999" }, [VENDAS], null);

    expect(frase).toContain("999");
    expect(frase).toMatch(/não corresponde/i);
  });

  it("pede a etapa quando o funil está certo e ela falta", () => {
    const frase = montarConclusao({ ...COMPLETO, etapaQualificado: undefined }, [VENDAS], null);

    expect(frase).toContain("KOMMO_ETAPA_QUALIFICADO");
    expect(frase).toContain("FUNIL DE VENDAS");
  });

  it("acusa etapa que existe em outro funil", () => {
    // 110501711 é do FUNIL DE CLIENTES. Aceitá-la faria o evento de qualificado
    // disparar numa mudança de etapa que não é venda nenhuma.
    const frase = montarConclusao(
      { ...COMPLETO, etapaQualificado: "110501711" },
      [VENDAS, CLIENTES],
      null,
    );

    expect(frase).toContain("110501711");
    expect(frase).toMatch(/não existe/i);
  });

  it("cobra o segredo do webhook depois que funil e etapa estão de pé", () => {
    const frase = montarConclusao({ ...COMPLETO, temSegredoDoWebhook: false }, [VENDAS], captura());

    expect(frase).toContain("KOMMO_WEBHOOK_SECRET");
    expect(frase).toContain("QUALIFICAÇÃO");
  });

  it("aponta a captura quando nenhum negócio recente traz o clique", () => {
    const frase = montarConclusao(COMPLETO, [VENDAS], captura({ comClique: 0 }));

    expect(frase).toContain("50");
    expect(frase).toMatch(/camposVistos/);
  });

  it("não acusa captura quando a conta não tem negócio recente", () => {
    // Amostra vazia é conta parada, não captura quebrada.
    const frase = montarConclusao(COMPLETO, [VENDAS], captura({ amostra: 0, comClique: 0 }));

    expect(frase).toContain("Configuração completa");
  });

  it("não acusa captura quando a amostra sequer pôde ser lida", () => {
    const frase = montarConclusao(COMPLETO, [VENDAS], null);

    expect(frase).toContain("Configuração completa");
  });
});
