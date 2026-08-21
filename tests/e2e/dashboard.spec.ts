import { expect, test } from "@playwright/test";

import { blocoDeDetalhe, ehCelular } from "./responsivo";

/**
 * Percursos que precisam funcionar em produção. Cada teste cobre um caminho
 * que um erro de integração ou de roteamento quebraria silenciosamente.
 */

test("visão geral carrega com indicadores e comparação", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Visão geral", level: 1 })).toBeVisible();
  await expect(page.getByText("Investimento total")).toBeVisible();
  await expect(page.getByText("vs. anterior").first()).toBeVisible();
  await expect(blocoDeDetalhe(page, "Resumo por canal")).toBeVisible();
});

test("navega entre canais mantendo o período escolhido", async ({ page }) => {
  await page.goto("/?preset=7d");

  await page.getByRole("link", { name: "Meta Ads" }).first().click();
  await expect(page).toHaveURL(/\/meta-ads\?preset=7d/);
  await expect(page.getByRole("heading", { name: "Meta Ads", level: 1 })).toBeVisible();
  // Preso à região de indicadores: solto, o texto casava também com a
  // legenda dos criativos ("ordenados por ... menor custo por lead").
  await expect(
    page.getByRole("region", { name: "Indicadores" }).getByText("Custo por lead"),
  ).toBeVisible();
});

test("troca de período atualiza os dados pela URL", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Alterar período" }).click();

  // Os presets são botões com `aria-pressed`, não uma listbox: o popover do
  // Radix não é um listbox de verdade, e anunciá-lo como tal engana o leitor
  // de tela.
  const preset = page.getByRole("button", { name: "Últimos 7 dias" });
  await expect(preset).toHaveAttribute("aria-pressed", "false");
  await preset.click();

  await expect(page).toHaveURL(/preset=7d/);
  await expect(page.getByRole("button", { name: "Alterar período" })).toBeVisible();

  // E o estado selecionado precisa refletir a escolha ao reabrir.
  await page.getByRole("button", { name: "Alterar período" }).click();
  await expect(page.getByRole("button", { name: "Últimos 7 dias" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

/** "R$ 1.234,56" -> 1234.56 */
function numero(texto: string): number {
  return Number(texto.replace(/[^\d,-]/g, "").replace(",", "."));
}

test("tabela ordena por coluna", async ({ page }) => {
  await page.goto("/meta-ads");

  const bloco = blocoDeDetalhe(page, "Campanhas");
  await expect(bloco).toBeVisible();

  if (!ehCelular(page)) {
    await bloco.getByRole("button", { name: /Investimento/ }).click();
    await expect(bloco.getByRole("columnheader", { name: /Investimento/ })).toHaveAttribute(
      "aria-sort",
      "descending",
    );
    return;
  }

  // No celular o cabeçalho não existe — a ordenação é um seletor. Sem ele o
  // cartão perderia justamente a função que faz a tabela valer no relatório.
  const raiz = bloco.locator("..");
  await raiz.getByLabel("Ordenar por").selectOption({ label: "Investimento" });

  const investimentos = bloco.locator("li").locator("dl > div", { hasText: "Investimento" });
  const decrescente = (await investimentos.locator("dd").allInnerTexts()).map(numero);
  expect(decrescente.length).toBeGreaterThan(1);
  expect(decrescente).toEqual([...decrescente].sort((a, b) => b - a));

  await raiz.getByRole("button", { name: "Ordenar do menor para o maior" }).click();
  const crescente = (await investimentos.locator("dd").allInnerTexts()).map(numero);
  expect(crescente).toEqual([...crescente].sort((a, b) => a - b));
});

test("os quatro canais respondem", async ({ page }) => {
  for (const [path, heading] of [
    ["/meta-ads", "Meta Ads"],
    ["/google-ads", "Google Ads"],
    ["/analytics", "Google Analytics"],
    ["/organico", "Orgânico"],
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
  }
});

test("o carrossel do orgânico mostra todas as artes, não só a capa", async ({ page }) => {
  await page.goto("/organico");

  const carrossel = page.getByRole("group", { name: /Carrossel com \d+ artes/ }).first();
  await carrossel.scrollIntoViewIfNeeded();
  await expect(carrossel).toBeVisible();

  const cartao = page.locator("li", { has: carrossel }).first();
  await expect(cartao.getByText(/^1\/\d+$/)).toBeVisible();

  // Encaixe de rolagem é comportamento de navegador — vitest com jsdom não
  // consegue provar que a arte seguinte realmente entra em quadro.
  await cartao.getByRole("button", { name: "Próxima arte" }).click();
  await expect(cartao.getByText(/^2\/\d+$/)).toBeVisible();

  const artes = carrossel.locator("img:not([aria-hidden='true'])");
  expect(await artes.count()).toBeGreaterThan(1);
});

test("endereço inexistente devolve a tela de não encontrado", async ({ page }) => {
  await page.goto("/rota-que-nao-existe");
  await expect(page.getByText("Página não encontrada")).toBeVisible();
});

test("a API responde no contrato esperado", async ({ request }) => {
  const response = await request.get("/api/v1/reports/meta-ads?preset=7d");
  expect(response.status()).toBe(200);

  const body = await response.json();
  expect(body.channel).toBe("meta-ads");
  expect(body.series).toHaveLength(7);
  expect(response.headers()["x-ratelimit-limit"]).toBeTruthy();
});

test("canal desconhecido devolve 404 sem detalhe interno", async ({ request }) => {
  const response = await request.get("/api/v1/reports/tiktok");
  expect(response.status()).toBe(404);
  expect(await response.text()).not.toMatch(/token|stack|at\s+\//i);
});
