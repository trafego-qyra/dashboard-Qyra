import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatTile } from "@/components/ui/stat-tile";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Kpi } from "@/lib/types";

function renderTile(kpi: Kpi) {
  return render(
    <TooltipProvider>
      <StatTile kpi={kpi} />
    </TooltipProvider>,
  );
}

describe("StatTile", () => {
  it("formata o valor conforme o tipo da métrica", () => {
    renderTile({ key: "spend", label: "Investimento", value: 1234.5, format: "currency" });
    expect(screen.getByText(/1\.234,50/)).toBeInTheDocument();
  });

  it("mostra alta como positiva quando maior é melhor", () => {
    renderTile({ key: "leads", label: "Leads", value: 120, previousValue: 100, format: "integer" });
    expect(screen.getByText("+20,0%")).toBeInTheDocument();
  });

  it("lê queda de custo como resultado positivo", () => {
    renderTile({
      key: "cpl",
      label: "CPL",
      value: 80,
      previousValue: 100,
      format: "currency",
      lowerIsBetter: true,
    });
    const delta = screen.getByText("-20,0%");
    // A cor é reforço; a direção também aparece no ícone e no texto.
    expect(delta.closest("span")?.className).toContain("text-positive");
  });

  it("diz explicitamente quando não há base de comparação", () => {
    renderTile({ key: "x", label: "Sessões", value: 10, format: "integer" });
    expect(screen.getByText("Sem base de comparação")).toBeInTheDocument();
  });

  it("expõe a explicação do cálculo como controle acessível", () => {
    renderTile({
      key: "cpa",
      label: "CPA",
      value: 20,
      format: "currency",
      hint: "Investimento dividido por conversões.",
    });
    expect(screen.getByLabelText("Como CPA é calculado")).toBeInTheDocument();
  });
});
