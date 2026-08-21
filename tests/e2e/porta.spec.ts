import { expect, test } from "@playwright/test";

import { SENHA_DE_TESTE } from "../../playwright.config";

/**
 * O porteiro, visto de fora.
 *
 * Estes testes rodam sem sessão de propósito — é o único projeto do e2e que
 * não herda o estado autenticado. Um painel que protege as telas mas deixa a
 * API aberta não protege nada, e essa é a falha que passa despercebida numa
 * revisão de código: ninguém digita `/api/...` no navegador.
 */

test("tela do painel manda para o login", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Entrar no painel" })).toBeVisible();
});

test("guarda para onde a pessoa queria ir", async ({ page }) => {
  await page.goto("/meta-ads?preset=7d");

  await expect(page).toHaveURL(/\/login\?de=%2Fmeta-ads%3Fpreset%3D7d/);
});

test("volta ao destino original depois de entrar", async ({ page }) => {
  await page.goto("/organico");
  await page.getByLabel("Senha de acesso").fill(SENHA_DE_TESTE);
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page).toHaveURL(/\/organico$/);
  await expect(page.getByRole("heading", { name: "Orgânico", level: 1 })).toBeVisible();
});

test("senha errada não entra e diz por quê", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Senha de acesso").fill("chute");
  await page.getByRole("button", { name: "Entrar" }).click();

  // Preso ao id: o Next mantém um anunciador de rota com `role="alert"` na
  // página, e um seletor por papel casaria com os dois.
  await expect(page.locator("#erro-login")).toContainText(/senha incorreta/i);
  await expect(page).toHaveURL(/erro=senha/);
});

test("a API não responde a quem não entrou", async ({ request }) => {
  const resposta = await request.get("/api/v1/reports/meta-ads?preset=7d", {
    maxRedirects: 0,
  });

  // Redirecionamento, não 200: o dado não sai daqui sem sessão.
  expect(resposta.status()).toBe(307);
  expect(await resposta.text()).not.toMatch(/spend|investimento|leads/i);
});

test("o diagnóstico, que expõe configuração, também está atrás da porta", async ({ request }) => {
  const resposta = await request.get("/api/diagnostico/meta", { maxRedirects: 0 });

  expect(resposta.status()).toBe(307);
});

test("um cookie forjado não abre a porta", async ({ page, context }) => {
  await context.addCookies([
    {
      name: "qyra_sessao",
      // Data de expiração lá na frente, assinatura inventada.
      value: `${Date.now() + 999_999_999}.assinatura-falsa`,
      url: page.url() === "about:blank" ? "http://127.0.0.1:3210" : page.url(),
    },
  ]);

  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
});

test("a tela de login não precisa de sessão para carregar", async ({ page }) => {
  const resposta = await page.goto("/login");

  expect(resposta?.status()).toBe(200);
});
