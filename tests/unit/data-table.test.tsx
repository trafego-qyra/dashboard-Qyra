import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { DataTable } from "@/components/ui/data-table";
import type { TableBlock } from "@/lib/types";

const BLOCK: TableBlock = {
  title: "Campanhas",
  columns: [
    { key: "name", label: "Campanha", align: "left" },
    { key: "spend", label: "Investimento", format: "currency", align: "right" },
  ],
  rows: [
    { name: "Alfa", spend: 100 },
    { name: "Bravo", spend: 300 },
    { name: "Charlie", spend: 200 },
  ],
};

describe("DataTable", () => {
  it("renderiza os valores já formatados", () => {
    render(<DataTable block={BLOCK} />);
    // Duas apresentações do mesmo dado: a tabela para telas largas e a lista de
    // cartões para o celular. Só uma fica visível por vez, via CSS.
    expect(screen.getAllByText(/300,00/).length).toBeGreaterThan(0);
  });

  it("expõe cada linha também como cartão, para leitura no celular", () => {
    render(<DataTable block={BLOCK} />);

    // A versão em cartão usa lista de definição: rótulo e valor empilhados.
    const rotulos = screen.getAllByText("Investimento");
    expect(rotulos.length).toBeGreaterThanOrEqual(2);
  });

  it("ordena por coluna e marca a direção para leitores de tela", async () => {
    const user = userEvent.setup();
    render(<DataTable block={BLOCK} />);

    await user.click(screen.getByRole("button", { name: /Investimento/ }));

    const header = screen.getByRole("columnheader", { name: /Investimento/ });
    expect(header).toHaveAttribute("aria-sort", "descending");

    const firstRow = screen.getAllByRole("row")[1];
    expect(within(firstRow).getByText("Bravo")).toBeInTheDocument();
  });

  it("inverte a ordenação no segundo clique", async () => {
    const user = userEvent.setup();
    render(<DataTable block={BLOCK} />);

    const button = screen.getByRole("button", { name: /Investimento/ });
    await user.click(button);
    await user.click(button);

    const firstRow = screen.getAllByRole("row")[1];
    expect(within(firstRow).getByText("Alfa")).toBeInTheDocument();
  });

  it("explica o vazio em vez de mostrar tabela sem linha", () => {
    render(<DataTable block={{ ...BLOCK, rows: [] }} />);
    expect(screen.getByText("Nenhum registro no período")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
