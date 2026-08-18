import { describe, expect, it } from "vitest";

import { daysBetween, eachDay, parseRange, previousRange, rangeFromPreset } from "@/lib/date-range";

const TODAY = new Date("2026-03-10T12:00:00Z");

describe("rangeFromPreset", () => {
  it("termina ontem, porque o dia corrente é parcial em toda plataforma", () => {
    expect(rangeFromPreset("7d", TODAY)).toEqual({ from: "2026-03-03", to: "2026-03-09" });
  });

  it("respeita o tamanho de cada preset", () => {
    expect(daysBetween(rangeFromPreset("28d", TODAY))).toBe(28);
    expect(daysBetween(rangeFromPreset("90d", TODAY))).toBe(90);
  });
});

describe("previousRange", () => {
  it("devolve a janela de mesmo tamanho imediatamente anterior", () => {
    const range = { from: "2026-03-03", to: "2026-03-09" };
    expect(previousRange(range)).toEqual({ from: "2026-02-24", to: "2026-03-02" });
  });

  it("não deixa buraco nem sobreposição entre as janelas", () => {
    const range = rangeFromPreset("28d", TODAY);
    const previous = previousRange(range);
    expect(daysBetween(previous)).toBe(daysBetween(range));
    // As janelas se encostam sem buraco: a anterior termina na véspera da atual.
    expect(eachDay(range)[0]).toBe("2026-02-10");
    expect(eachDay(previous).at(-1)).toBe("2026-02-09");
  });
});

describe("parseRange", () => {
  it("aceita intervalo customizado válido", () => {
    expect(parseRange({ from: "2026-01-01", to: "2026-01-31" }, TODAY)).toEqual({
      range: { from: "2026-01-01", to: "2026-01-31" },
      preset: "custom",
    });
  });

  it("ignora entrada inválida em vez de quebrar a tela", () => {
    for (const params of [
      { from: "ontem", to: "hoje" },
      { from: "2026-01-31", to: "2026-01-01" },
      { preset: "999d" },
      {},
    ]) {
      const { preset } = parseRange(params, TODAY);
      expect(preset).toBe("28d");
    }
  });
});

describe("eachDay", () => {
  it("inclui as duas pontas", () => {
    expect(eachDay({ from: "2026-03-01", to: "2026-03-03" })).toEqual([
      "2026-03-01",
      "2026-03-02",
      "2026-03-03",
    ]);
  });
});
