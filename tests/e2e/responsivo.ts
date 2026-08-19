import type { Locator, Page } from "@playwright/test";

/** Mesmo ponto de corte do `md:` do Tailwind, onde o cartão vira tabela. */
const BREAKPOINT_TABELA = 768;

export function ehCelular(page: Page): boolean {
  return (page.viewportSize()?.width ?? BREAKPOINT_TABELA) < BREAKPOINT_TABELA;
}

/**
 * O mesmo bloco de dados tem duas formas: lista de cartões no celular, tabela
 * no desktop. O teste precisa afirmar sobre o que o usuário realmente vê, não
 * sobre a marcação de um dos dois casos.
 */
export function blocoDeDetalhe(page: Page, titulo: string | RegExp): Locator {
  return ehCelular(page)
    ? page.getByRole("list", { name: titulo })
    : page.getByRole("table", { name: titulo });
}
