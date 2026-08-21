import { expect, test as setup } from "@playwright/test";

import { ESTADO_AUTENTICADO, SENHA_DE_TESTE } from "../../playwright.config";

/**
 * Entra uma vez e guarda a sessão para as demais suítes.
 *
 * Além de habilitar o resto dos testes, este é o teste do caminho feliz do
 * login: se o formulário parar de funcionar, tudo falha aqui, com a causa
 * visível, em vez de trinta testes falhando por redirecionamento.
 */
setup("entra no painel com a senha", async ({ page }) => {
  await page.goto("/login");

  await page.getByLabel("Senha de acesso").fill(SENHA_DE_TESTE);
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page.getByRole("heading", { name: "Visão geral", level: 1 })).toBeVisible();
  await page.context().storageState({ path: ESTADO_AUTENTICADO });
});
