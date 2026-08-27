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

test("com senha configurada, o diagnóstico de saúde também fica atrás da porta", async ({
  request,
}) => {
  // A exceção do `/api/health` vale só enquanto não há senha. Com senha — que
  // é o caso desta suíte — ele volta para trás da porta como todo o resto.
  const resposta = await request.get("/api/health", { maxRedirects: 0 });

  expect(resposta.status()).toBe(307);
});

test("o formulário é nativo, para o gerenciador de senha reconhecê-lo", async ({ page }) => {
  await page.goto("/login");

  const formulario = page.locator("form").filter({ has: page.locator("#senha") });

  // Server Action envia por JavaScript, sem navegação, e o navegador não
  // oferece guardar a senha. Envio nativo com POST devolve esse sinal.
  await expect(formulario).toHaveAttribute("method", /post/i);
  await expect(formulario).toHaveAttribute("action", "/api/sessao");

  // O Chrome só guarda a senha quando há um usuário para associar a ela.
  await expect(page.locator('input[autocomplete="username"]')).toHaveCount(1);
  await expect(page.locator('input[autocomplete="current-password"]')).toHaveCount(1);
});

test("formulário postado de outro site não entra", async ({ request }) => {
  const resposta = await request.post("/api/sessao", {
    headers: {
      origin: "https://site-de-fora.example",
      "content-type": "application/x-www-form-urlencoded",
    },
    form: { senha: SENHA_DE_TESTE },
    maxRedirects: 0,
  });

  // A Server Action conferia a origem sozinha; a rota precisa conferir na mão.
  // Sem isso, outra página postaria senhas em nome de quem tem a aba aberta.
  expect(resposta.status()).toBe(303);
  expect(resposta.headers().location).toMatch(/erro=origem/);
  expect(resposta.headers()["set-cookie"]).toBeUndefined();
});

test("a tela de login não precisa de sessão para carregar", async ({ page }) => {
  const resposta = await page.goto("/login");

  expect(resposta?.status()).toBe(200);
});
