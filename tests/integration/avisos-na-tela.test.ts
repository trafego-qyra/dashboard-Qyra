import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A trava de verdade: com nenhum canal configurado — o estado em que mais
 * aparece encanamento — a tela não pode exibir aviso nenhum de operação.
 */

const RANGE = { from: "2026-02-01", to: "2026-02-03" };

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("avisos que chegam à tela", () => {
  it("relatório consolidado sem credencial não mostra encanamento", async () => {
    vi.stubEnv("QYRA_FORCE_MOCK", "true");

    const { getOverviewReport } = await import("@/server/reports");
    const { avisosVisiveis } = await import("@/lib/avisos");
    const relatorio = await getOverviewReport(RANGE);

    // Existe encanamento no payload — é dele que /api/health vive.
    expect(relatorio.notices.some((n) => n.audience === "operacao")).toBe(true);

    const naTela = avisosVisiveis(relatorio.notices)
      .map((n) => n.text)
      .join(" ");
    expect(naTela).not.toMatch(/QYRA_FORCE_MOCK|credencial|token|permissão|API/i);
  });

  it("cada canal declara a audiência de todo aviso que emite", async () => {
    vi.stubEnv("QYRA_FORCE_MOCK", "true");

    const { getChannelReport } = await import("@/server/reports");

    for (const canal of ["meta-ads", "google-ads", "ga4", "organico"] as const) {
      const relatorio = await getChannelReport(canal, RANGE);
      for (const aviso of relatorio.notices) {
        expect(["cliente", "operacao"]).toContain(aviso.audience);
        expect(aviso.text.length).toBeGreaterThan(0);
      }
    }
  });
});
