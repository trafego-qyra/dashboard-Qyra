/**
 * Teste de mutação.
 *
 * Roda só sobre a lógica de negócio pura (`src/lib`) — é onde um teste fraco
 * passa despercebido e onde um erro de cálculo vira número errado no relatório
 * do cliente. Mutar componentes de UI custaria muito para provar pouco, então
 * fica fora do escopo. Não entra no CI de todo PR (é caro): roda sob demanda e
 * no agendamento semanal.
 */
export default {
  packageManager: "npm",
  testRunner: "vitest",
  vitest: { configFile: "vitest.config.mts" },
  reporters: ["html", "clear-text", "progress"],
  coverageAnalysis: "perTest",
  mutate: ["src/lib/format.ts", "src/lib/date-range.ts", "src/mocks/generator.ts"],
  thresholds: { high: 85, low: 70, break: 60 },
  timeoutMS: 30000,
  tempDirName: "node_modules/.stryker-tmp",
};
