import { describe, expect, it } from "vitest";

import { GOOGLE_ADS_SNAPSHOT } from "@/data/google-ads-snapshot";
import { buildGoogleAdsSnapshotReport } from "@/server/connectors/google-ads-snapshot";

/**
 * O snapshot é dado real da conta, apresentado a cliente. Um erro de conversão
 * aqui vira número errado numa reunião, sem nenhuma API para culpar — por isso
 * os totais são conferidos contra os do próprio export.
 */

const RANGE = { from: "2026-08-04", to: "2026-08-17" };

describe("snapshot do Google Ads", () => {
  const report = buildGoogleAdsSnapshotReport(RANGE, "2026-08-19T00:00:00.000Z");

  it("declara a origem como período fixo, nem ao vivo nem demonstração", () => {
    expect(report.source).toBe("snapshot");
    expect(report.periodLabel).toBe("4 de agosto de 2026 - 17 de agosto de 2026");
  });

  it("reproduz os totais do export", () => {
    const valor = (chave: string) => report.kpis.find((k) => k.key === chave)?.value;

    expect(valor("cost")).toBe(285.12);
    expect(valor("clicks")).toBe(205);
    expect(valor("impressions")).toBe(5218);
    expect(valor("conversions")).toBe(1);
  });

  it("mantém CTR e CPC coerentes com cliques, impressões e custo", () => {
    const valor = (chave: string) => report.kpis.find((k) => k.key === chave)?.value ?? 0;

    expect(valor("ctr")).toBeCloseTo(205 / 5218, 5);
    expect(valor("cpc")).toBeCloseTo(285.12 / 205, 2);
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
    expect(soma).toBeCloseTo(285.12, 1);
  });

  it("traz as sete tabelas do relatório", () => {
    expect(report.tables.map((t) => t.title)).toEqual([
      "Campanhas",
      "Grupos de anúncios",
      "Termos de pesquisa",
      "Palavras-chave",
      "Dispositivos",
      "Desempenho por dia da semana",
      "Locais",
    ]);
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
    expect(soma).toBeCloseTo(285.12, 2);
  });

  it("o investimento dos grupos soma o total da conta", () => {
    const grupos = report.tables.find((t) => t.title === "Grupos de anúncios");
    const soma = (grupos?.rows ?? []).reduce((a, r) => a + Number(r.custo), 0);
    expect(soma).toBeCloseTo(285.12, 1);
  });

  it("carrega o período no relatório, para o cabeçalho estampar", () => {
    // O aviso em faixa saiu — repetia o que o cabeçalho já diz e roubava a
    // primeira dobra. `periodLabel` é o que sobrou carregando a informação, e
    // sem ele o cabeçalho mostra só "Período fixo", sem o intervalo.
    expect(report.source).toBe("snapshot");
    expect(report.periodLabel).toMatch(/agosto de 2026/);
  });

  it("não emite aviso em faixa", () => {
    expect(report.notices).toEqual([]);
  });
});
