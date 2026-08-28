import { describe, expect, it } from "vitest";

import { GOOGLE_ADS_SNAPSHOT } from "@/data/google-ads-snapshot";
import { buildGoogleAdsSnapshotReport } from "@/server/connectors/google-ads-snapshot";

/**
 * O snapshot é dado real da conta, apresentado a cliente. Um erro de conversão
 * aqui vira número errado numa reunião, sem nenhuma API para culpar.
 *
 * **As expectativas saem do próprio snapshot, não de números escritos aqui.**
 * A primeira versão destes testes cravava os totais de um export específico, e
 * a primeira troca de dados quebrou oito deles de uma vez — sem que nada
 * estivesse errado. O que precisa ser travado é a coerência: o total bate com a
 * soma das partes, o percentual está na escala certa, as tabelas existem. Isso
 * vale para qualquer export.
 */

const RANGE = { from: "2026-08-04", to: "2026-08-17" };

const T = GOOGLE_ADS_SNAPSHOT.totais;

describe("snapshot do Google Ads", () => {
  const report = buildGoogleAdsSnapshotReport(RANGE, "2026-08-19T00:00:00.000Z");

  it("declara a origem como período fixo, nem ao vivo nem demonstração", () => {
    expect(report.source).toBe("snapshot");
    expect(report.periodLabel).toBe(GOOGLE_ADS_SNAPSHOT.periodoRotulo);
  });

  it("leva os totais do export para os indicadores", () => {
    const valor = (chave: string) => report.kpis.find((k) => k.key === chave)?.value;

    expect(valor("cost")).toBe(T.custo);
    expect(valor("clicks")).toBe(T.cliques);
    expect(valor("impressions")).toBe(T.impressoes);
    expect(valor("conversions")).toBe(T.conversoes);
  });

  it("mantém CTR e CPC coerentes com cliques, impressões e custo", () => {
    const valor = (chave: string) => report.kpis.find((k) => k.key === chave)?.value ?? 0;

    // Derivadas erradas são o defeito mais caro aqui: passam despercebidas
    // porque continuam plausíveis.
    expect(valor("ctr")).toBeCloseTo(T.cliques / T.impressoes, 5);
    expect(valor("cpc")).toBeCloseTo(T.custo / T.cliques, 2);
  });

  it("exibe percentual na escala 0-1, não 0-100", () => {
    // "3,93%" no CSV precisa virar 0,0393 — a escala errada multiplicaria o
    // número por 100 na tela, e o valor ainda pareceria plausível.
    const ctr = report.kpis.find((k) => k.key === "ctr")?.value ?? 0;
    expect(ctr).toBeGreaterThan(0);
    expect(ctr).toBeLessThan(1);

    for (const tabela of report.tables) {
      // No relatório de termos de pesquisa o próprio Google registra CTR acima
      // de 100%: cliques e impressões são amostrados de formas diferentes, e um
      // termo pode ter 2 cliques com 1 impressão. A interface do Google Ads
      // exibe "200,00%" nesses casos — o painel reproduz o dado, não o corrige.
      const teto = tabela.title === "Termos de pesquisa" ? 5 : 1;
      const colunasPercentuais = tabela.columns.filter((c) => c.format === "percent");
      for (const linha of tabela.rows) {
        for (const coluna of colunasPercentuais) {
          const v = Number(linha[coluna.key]);
          if (!Number.isFinite(v)) continue;
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(teto);
        }
      }
    }
  });

  it("plota por hora do dia, com as 24 horas presentes", () => {
    expect(report.seriesAxis).toBe("hour");
    expect(report.series).toHaveLength(24);
    expect(report.series[0].date).toBe("00");
    expect(report.series.at(-1)?.date).toBe("23");
  });

  it("soma das horas bate com o total, dentro do arredondamento do export", () => {
    const soma = report.series.reduce((a, p) => a + Number(p.cost), 0);
    expect(soma).toBeCloseTo(T.custo, 1);
  });

  it("traz as tabelas do relatório, na ordem", () => {
    const esperadas = [
      "Campanhas",
      "Grupos de anúncios",
      "Termos de pesquisa",
      "Palavras-chave",
      "Dispositivos",
      "Desempenho por dia da semana",
      "Locais",
    ];
    // O leilão só existe quando a conta tem concorrência suficiente para o
    // Google divulgar a comparação. Ausente, a tabela não aparece — e não é
    // falha.
    if (GOOGLE_ADS_SNAPSHOT.leilao.length > 0) esperadas.push("Quem disputa as mesmas buscas");

    expect(report.tables.map((t) => t.title)).toEqual(esperadas);
  });

  it("declara quantas linhas ficaram fora das tabelas truncadas", () => {
    const locais = report.tables.find((t) => t.title === "Locais");
    const termos = report.tables.find((t) => t.title === "Termos de pesquisa");

    // Truncar sem dizer faz o leitor concluir que viu tudo.
    expect(locais?.description).toContain(
      String(GOOGLE_ADS_SNAPSHOT.locais.length + GOOGLE_ADS_SNAPSHOT.locaisRestantes),
    );
    expect(termos?.description).toContain(
      String(GOOGLE_ADS_SNAPSHOT.termos.length + GOOGLE_ADS_SNAPSHOT.termosRestantes),
    );
  });

  it("o investimento das campanhas soma o total da conta", () => {
    const campanhas = report.tables.find((t) => t.title === "Campanhas");
    const soma = (campanhas?.rows ?? []).reduce((a, r) => a + Number(r.custo), 0);
    expect(soma).toBeCloseTo(T.custo, 2);
  });

  it("o investimento dos grupos soma o total da conta", () => {
    const grupos = report.tables.find((t) => t.title === "Grupos de anúncios");
    const soma = (grupos?.rows ?? []).reduce((a, r) => a + Number(r.custo), 0);
    expect(soma).toBeCloseTo(T.custo, 1);
  });

  it("carrega o período no relatório, para o cabeçalho estampar", () => {
    // O aviso em faixa saiu — repetia o que o cabeçalho já diz e roubava a
    // primeira dobra. `periodLabel` é o que sobrou carregando a informação, e
    // sem ele o cabeçalho mostra só "Período fixo", sem o intervalo.
    expect(report.source).toBe("snapshot");
    expect(report.periodLabel?.trim()).toBeTruthy();
  });

  it("as porcentagens do leilão saem como texto, na notação do Google", () => {
    const leilao = report.tables.find((t) => t.title === "Quem disputa as mesmas buscas");
    if (!leilao) return;

    // O Google publica faixas quando o volume é baixo — "< 10%". Converter isso
    // em número diria "nenhuma impressão" onde o dado real é "menos de dez por
    // cento", e a conta apareceria pior do que é.
    for (const linha of leilao.rows) {
      expect(typeof linha.parcelaImpressoes).toBe("string");
    }
    expect(leilao.columns.every((c) => c.format === undefined)).toBe(true);
  });

  it("não emite aviso em faixa", () => {
    expect(report.notices).toEqual([]);
  });
});
