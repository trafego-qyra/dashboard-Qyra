import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` é um marcador de build do Next; no Vitest ele vira no-op
      // para que a camada de servidor possa ser exercitada diretamente.
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    // e2e é do Playwright; o Vitest cobre unitário e integração.
    include: ["tests/unit/**/*.test.{ts,tsx}", "tests/integration/**/*.test.{ts,tsx}"],
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      reportsDirectory: "./coverage",
      // O limiar cobre a camada de lógica — cálculo de métrica, janela de datas,
      // conectores, agregação e rate limit. É onde um bug vira número errado no
      // relatório do cliente. A camada de apresentação (charts, shell, brand) é
      // exercitada pelo Playwright: medir cobertura de markup infla o número
      // sem provar nada.
      include: ["src/lib/**", "src/server/**", "src/mocks/**"],
      exclude: ["src/**/*.d.ts"],
      thresholds: {
        lines: 85,
        functions: 80,
        branches: 60,
        statements: 85,
      },
    },
  },
});
