import { expect, test } from "@playwright/test";

/**
 * Percursos que precisam funcionar em produção. Cada teste cobre um caminho
 * que um erro de integração ou de roteamento quebraria silenciosamente.
 */

test("visão geral carrega com indicadores e comparação", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Visão geral", level: 1 })).toBeVisible();
  await expect(page.getByText("Investimento total")).toBeVisible();
  await expect(page.getByText("vs. anterior").first()).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
});

test("navega entre canais mantendo o período escolhido", async ({ page }) => {
  await page.goto("/?preset=7d");

  await page.getByRole("link", { name: "Meta Ads" }).first().click();
  await expect(page).toHaveURL(/\/meta-ads\?preset=7d/);
  await expect(page.getByRole("heading", { name: "Meta Ads", level: 1 })).toBeVisible();
  await expect(page.getByText("Custo por lead")).toBeVisible();
});

test("troca de período atualiza os dados pela URL", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Alterar período" }).click();
  await page.getByRole("option", { name: "Últimos 7 dias" }).click();

  await expect(page).toHaveURL(/preset=7d/);
  await expect(page.getByRole("button", { name: "Alterar período" })).toBeVisible();
});

test("tabela ordena por coluna", async ({ page }) => {
  await page.goto("/meta-ads");

  const header = page.getByRole("button", { name: /Investimento/ }).last();
  await header.click();
  await expect(page.getByRole("columnheader", { name: /Investimento/ })).toHaveAttribute(
    "aria-sort",
    "descending",
  );
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
