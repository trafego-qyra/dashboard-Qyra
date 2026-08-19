import { expect, test } from "@playwright/test";

import { blocoDeDetalhe, ehCelular } from "./responsivo";

/**
 * Acessibilidade das rotas principais. Não substitui auditoria manual, mas
 * trava as regressões que mais aparecem: foco, hierarquia de título e
 * identidade que depende só de cor.
 */

const ROTAS = ["/", "/meta-ads", "/analytics"];

for (const rota of ROTAS) {
  test(`${rota} tem um h1 único e link de pular conteúdo`, async ({ page }) => {
    await page.goto(rota);

    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Pular para o conteúdo" })).toBeAttached();
  });

  test(`${rota} navega por teclado a partir do topo`, async ({ page }) => {
    await page.goto(rota);

    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Pular para o conteúdo" })).toBeFocused();
  });
}

test("séries de gráfico têm legenda textual, não só cor", async ({ page }) => {
  await page.goto("/meta-ads");

  // A legenda nomeia cada série; a cor é reforço.
  await expect(page.getByText("Investimento", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Leads", { exact: true }).first()).toBeVisible();
});

test("tabela expõe cabeçalhos e legenda para leitor de tela", async ({ page }) => {
  await page.goto("/meta-ads");

  // `blocoDeDetalhe` localiza pelo nome acessível, então o próprio seletor já
  // prova que existe legenda: <caption> na tabela, `aria-label` na lista.
  const bloco = blocoDeDetalhe(page, "Campanhas");
  await expect(bloco).toBeVisible();

  if (ehCelular(page)) {
    // No cartão o cabeçalho é o <dt> colado em cada valor — o rótulo viaja
    // junto do número, que é o que o leitor de tela precisa anunciar.
    await expect(bloco.locator("dt").first()).toBeVisible();
    return;
  }

  await expect(bloco.getByRole("columnheader").first()).toBeVisible();
});
