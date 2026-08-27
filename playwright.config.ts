import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3210);

/**
 * O painel é protegido por senha, e o e2e roda contra o build de produção —
 * onde a proteção está ligada. Em vez de furar o porteiro para os testes, cada
 * suíte parte de uma sessão obtida pelo próprio formulário: o caminho de
 * entrada é exercitado de verdade, uma vez, e o resto herda o estado.
 */
const SENHA_DE_TESTE = "senha-de-teste-do-e2e";
const ESTADO_AUTENTICADO = "tests/e2e/.auth/estado.json";

export { ESTADO_AUTENTICADO, SENHA_DE_TESTE };

const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

/**
 * E2E roda contra o build de produção, em modo mock: o objetivo é validar a
 * aplicação, não a disponibilidade das APIs de terceiros.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    // Ambientes com o Chromium pré-instalado (container de CI, sandbox remoto)
    // apontam PLAYWRIGHT_CHROMIUM_PATH em vez de baixar o browser de novo.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : undefined,
  },

  projects: [
    { name: "entrada", testMatch: /login\.setup\.ts/ },
    // `porta` e o setup rodam com regras próprias de sessão: repeti-los aqui
    // dentro de uma sessão válida testaria o contrário do que eles afirmam.
    {
      name: "desktop",
      testIgnore: [/porta\.spec\.ts/, /login\.setup\.ts/],
      use: { ...devices["Desktop Chrome"], storageState: ESTADO_AUTENTICADO },
      dependencies: ["entrada"],
    },
    {
      name: "mobile",
      testIgnore: [/porta\.spec\.ts/, /login\.setup\.ts/],
      use: { ...devices["Pixel 7"], storageState: ESTADO_AUTENTICADO },
      dependencies: ["entrada"],
    },
    // Sem sessão: o que a porta faz com quem não entrou.
    { name: "porta", testMatch: /porta\.spec\.ts/ },
  ],

  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npx next start -p ${PORT}`,
        // `/` redireciona para o login sem sessão; a espera precisa de um 200.
        url: `${BASE_URL}/login`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: { QYRA_FORCE_MOCK: "true", QYRA_SENHA: SENHA_DE_TESTE },
      },
});
