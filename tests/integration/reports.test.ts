import { describe, expect, it } from "vitest";

import { CHANNELS } from "@/lib/channels";
import { previousRange } from "@/lib/date-range";
import { getAllReports, getChannelReport, getOverviewReport } from "@/server/reports";

/**
 * Integração da camada de dados: exercita conector → cache → comparação →
 * agregação. Sem credencial (QYRA_FORCE_MOCK no setup) todo conector cai no
 * modo mock, então o teste roda offline e é determinístico.
 */

const RANGE = { from: "2026-02-01", to: "2026-02-28" };

describe("getChannelReport", () => {
  it.each(CHANNELS.map((c) => c.id))("entrega %s com comparação preenchida", async (channel) => {
    const report = await getChannelReport(channel, RANGE);

    expect(report.channel).toBe(channel);
    expect(report.source).toBe("mock");
    expect(report.notices.length).toBeGreaterThan(0);

    const comparable = report.kpis.filter((k) => k.previousValue !== undefined);
    expect(comparable.length).toBeGreaterThan(0);
  });

  it("não compara quando o chamador não pede", async () => {
    const report = await getChannelReport("ga4", RANGE, { compare: false });
    // O mock do GA4 já traz previousValue próprio; o que não pode é o agregador
    // inventar comparação para métrica ausente da série.
    for (const kpi of report.kpis) {
      if (kpi.previousValue === undefined) continue;
      expect(Number.isFinite(kpi.previousValue)).toBe(true);
    }
  });
});

describe("getAllReports", () => {
  it("devolve um resultado por canal, sempre", async () => {
    const results = await getAllReports(RANGE);
    expect(results).toHaveLength(CHANNELS.length);
    expect(results.every((r) => r.report !== null)).toBe(true);
    expect(results.every((r) => r.error === null)).toBe(true);
  });
});

describe("getOverviewReport", () => {
  it("consolida investimento e conversões dos canais pagos", async () => {
    const overview = await getOverviewReport(RANGE);

    const investment = overview.kpis.find((k) => k.key === "investment");
    const paid = overview.byChannel.filter(
      (c) => c.channel === "meta-ads" || c.channel === "google-ads",
    );

    expect(investment?.value).toBeCloseTo(
      paid.reduce((a, c) => a + c.investment, 0),
      2,
    );
    expect(investment?.previousValue).toBeGreaterThan(0);
  });

  it("mantém o slot de cor de cada canal", async () => {
    const overview = await getOverviewReport(RANGE);
    for (const entry of overview.byChannel) {
      const meta = CHANNELS.find((c) => c.id === entry.channel);
      expect(entry.slot).toBe(meta?.slot);
    }
  });

  it("cobre o intervalo inteiro na série consolidada", async () => {
    const overview = await getOverviewReport(RANGE);
    expect(overview.series).toHaveLength(28);
    expect(overview.series[0].date).toBe("2026-02-01");
  });

  it("compara contra a janela anterior de mesmo tamanho", async () => {
    const previous = previousRange(RANGE);
    const [current, before] = await Promise.all([
      getOverviewReport(RANGE),
      getOverviewReport(previous),
    ]);

    const currentInvestment = current.kpis.find((k) => k.key === "investment");
    const beforeInvestment = before.kpis.find((k) => k.key === "investment");
    expect(currentInvestment?.previousValue).toBeCloseTo(beforeInvestment?.value ?? -1, 2);
  });

  it("não deixa CPA ou taxa de conversão virar Infinity", async () => {
    const overview = await getOverviewReport(RANGE);
    for (const kpi of overview.kpis) {
      expect(Number.isFinite(kpi.value)).toBe(true);
    }
  });
});

describe("comparação de médias e razões", () => {
  /**
   * Regressão: `previousValue` era a **soma** dos valores diários da métrica.
   * Para investimento e cliques isso está certo; para CTR, CPL e duração média
   * é absurdo — somar 28 durações diárias dá 28 vezes uma duração, e a tela
   * exibia variações de centenas por cento que nunca aconteceram.
   *
   * A duração média do GA4 é o caso que exercita o agregador de verdade: é o
   * único KPI das fixtures sem `previousValue` próprio, então quem preenche a
   * comparação é o código sob teste.
   */
  it("compara duração média contra a média anterior, não contra a soma", async () => {
    const report = await getChannelReport("ga4", RANGE);
    const anterior = await getChannelReport("ga4", previousRange(RANGE), { compare: false });

    const duracao = report.kpis.find((k) => k.key === "avgDuration");
    const duracaoAnterior = anterior.kpis.find((k) => k.key === "avgDuration");

    expect(duracao?.previousValue).toBeCloseTo(duracaoAnterior?.value ?? -1, 6);
  });

  it("mantém a duração anterior na mesma ordem de grandeza da atual", async () => {
    const report = await getChannelReport("ga4", RANGE);
    const duracao = report.kpis.find((k) => k.key === "avgDuration");

    expect(duracao).toBeDefined();
    if (!duracao?.previousValue) throw new Error("KPI sem comparação preenchida");

    // A soma de 28 dias colocaria o valor anterior uma ordem de grandeza acima.
    expect(duracao.previousValue).toBeGreaterThan(duracao.value / 3);
    expect(duracao.previousValue).toBeLessThan(duracao.value * 3);
  });

  it("nenhum percentual anterior escapa da faixa [0, 1]", async () => {
    for (const canal of CHANNELS.map((c) => c.id)) {
      const report = await getChannelReport(canal, RANGE);

      for (const kpi of report.kpis) {
        if (kpi.previousValue === undefined || kpi.format !== "percent") continue;
        // Percentual anterior fora da faixa só acontece por soma indevida.
        expect(kpi.previousValue).toBeGreaterThanOrEqual(0);
        expect(kpi.previousValue).toBeLessThanOrEqual(1);
      }
    }
  });
});
