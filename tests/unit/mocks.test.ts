import { describe, expect, it } from "vitest";

import { dailyValue, jitter, noise } from "@/mocks/generator";
import { mockGa4, mockGoogleAds, mockMetaAds, mockOrganico } from "@/mocks/reports";

const RANGE = { from: "2026-02-01", to: "2026-02-28" };

describe("gerador determinístico", () => {
  it("devolve sempre o mesmo valor para a mesma semente", () => {
    expect(noise("qyra")).toBe(noise("qyra"));
    expect(dailyValue("a", "2026-02-01", 100)).toBe(dailyValue("a", "2026-02-01", 100));
  });

  it("varia entre sementes diferentes", () => {
    expect(noise("a")).not.toBe(noise("b"));
  });

  it("mantém o ruído dentro da amplitude pedida", () => {
    for (const seed of ["a", "b", "c", "d", "e"]) {
      expect(jitter(seed, 0.2)).toBeGreaterThanOrEqual(0.8);
      expect(jitter(seed, 0.2)).toBeLessThanOrEqual(1.2);
    }
  });
});

describe.each([
  ["meta-ads", mockMetaAds],
  ["google-ads", mockGoogleAds],
  ["ga4", mockGa4],
  ["organico", mockOrganico],
] as const)("relatório fictício de %s", (channel, build) => {
  const report = build(RANGE);

  it("respeita o contrato de canal", () => {
    expect(report.channel).toBe(channel);
    expect(report.source).toBe("mock");
    expect(report.range).toEqual(RANGE);
    expect(report.kpis.length).toBeGreaterThan(0);
    expect(report.seriesDefs.length).toBeGreaterThan(0);
  });

  it("cobre todos os dias do intervalo, sem buraco", () => {
    expect(report.series).toHaveLength(28);
    expect(report.series[0].date).toBe("2026-02-01");
    expect(report.series.at(-1)?.date).toBe("2026-02-28");
  });

  it("plota apenas métricas que existem na série", () => {
    for (const def of report.seriesDefs) {
      expect(report.series[0]).toHaveProperty(def.key);
    }
  });

  it("usa slots da paleta validada", () => {
    for (const def of report.seriesDefs) {
      expect(def.slot).toBeGreaterThanOrEqual(1);
      expect(def.slot).toBeLessThanOrEqual(5);
    }
  });

  it("não produz número inválido", () => {
    for (const point of report.series) {
      for (const [key, value] of Object.entries(point)) {
        if (key === "date") continue;
        expect(Number.isFinite(value as number)).toBe(true);
        expect(value as number).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("é estável entre execuções", () => {
    expect(build(RANGE).series).toEqual(report.series);
  });
});
