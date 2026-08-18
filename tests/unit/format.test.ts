import { describe, expect, it } from "vitest";

import { computeDelta, formatAxis, formatMetric } from "@/lib/format";

describe("formatMetric", () => {
  it("formata moeda em pt-BR", () => {
    expect(formatMetric(1234.5, "currency")).toMatch(/R\$/);
    expect(formatMetric(1234.5, "currency")).toContain("1.234,50");
  });

  it("compacta valores altos quando pedido", () => {
    expect(formatMetric(125_000, "integer", { compact: true })).toMatch(/^125\s?mil$/);
    expect(formatMetric(1_500, "integer", { compact: true })).toBe("1.500");
  });

  it("formata percentual, razão e duração", () => {
    expect(formatMetric(0.0345, "percent")).toBe("3,45%");
    expect(formatMetric(2.5, "ratio")).toBe("2,50x");
    expect(formatMetric(135, "duration")).toBe("2m 15s");
    expect(formatMetric(45, "duration")).toBe("45s");
  });

  it("devolve travessão para valores ausentes ou inválidos", () => {
    expect(formatMetric(null, "currency")).toBe("—");
    expect(formatMetric(Number.NaN, "integer")).toBe("—");
    expect(formatMetric(Number.POSITIVE_INFINITY, "percent")).toBe("—");
  });
});

describe("formatAxis", () => {
  it("compacta números do eixo", () => {
    expect(formatAxis(1_200_000, "integer")).toMatch(/^1,2\s?mi$/);
  });

  it("mantém percentual legível", () => {
    expect(formatAxis(0.12, "percent")).toBe("12,0%");
  });
});

describe("computeDelta", () => {
  it("marca alta como positiva quando maior é melhor", () => {
    const delta = computeDelta(120, 100);
    expect(delta.direction).toBe("up");
    expect(delta.tone).toBe("positive");
    expect(delta.label).toContain("+");
  });

  it("inverte a leitura quando menor é melhor", () => {
    const delta = computeDelta(80, 100, true);
    expect(delta.direction).toBe("down");
    expect(delta.tone).toBe("positive");
  });

  it("trata variação abaixo de 0,5% como estável", () => {
    expect(computeDelta(100.2, 100).tone).toBe("neutral");
    expect(computeDelta(100.2, 100).direction).toBe("flat");
  });

  it("não compara contra base ausente ou zero", () => {
    expect(computeDelta(10, undefined).ratio).toBeNull();
    expect(computeDelta(10, 0).ratio).toBeNull();
  });
});
