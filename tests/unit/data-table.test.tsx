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
    expect(screen.getByText(/300,00/)).toBeInTheDocument();
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
