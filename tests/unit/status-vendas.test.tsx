import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatusDeVendasView } from "@/components/report/status-vendas";
import type { StatusDeVendas } from "@/lib/types";

/**
 * A tela de status comercial.
 *
 * O que precisa estar travado não é o desenho — é o rótulo. A tela junta duas
 * janelas diferentes na mesma dobra, e foi exatamente isso que obrigou o slide
 * feito à mão a ter asterisco: sem dizer qual número é do período e qual é da
 * base de hoje, quem lê soma os dois.
 */

const STATUS: StatusDeVendas = {
  range: { from: "2026-02-01", to: "2026-02-28" },
  source: "live",
  fetchedAt: "2026-03-01T12:00:00.000Z",
  gerados: 89,
  ganhos: 2,
  perdidos: 31,
  receita: 2658,
  baseTotal: 121,
  etapas: [
    { nome: "Demanda", negocios: 34 },
    { nome: "Qualificação", negocios: 22 },
    { nome: "Negociação", negocios: 9 },
    { nome: "Reabordagem", negocios: 26 },
    { nome: "Venda ganha", negocios: 2, desfecho: "ganho" },
    { nome: "Perdido", negocios: 28, desfecho: "perdido" },
  ],
  metas: { vendas: 30, receita: 56_970 },
  notices: [],
};

describe("StatusDeVendasView", () => {
  it("separa o que é do período do que é da base de hoje", () => {
    render(<StatusDeVendasView status={STATUS} />);

    expect(screen.getByText("No período")).toBeInTheDocument();
    expect(screen.getByText("A base agora")).toBeInTheDocument();
    expect(screen.getByText(/01\/02\/2026 a 28\/02\/2026/)).toBeInTheDocument();
  });

  it("mostra o quanto falta para a meta, em texto", () => {
    render(<StatusDeVendasView status={STATUS} />);

    // Barra sozinha não sobrevive a leitor de tela nem a impressão em preto e
    // branco: o número precisa estar escrito ao lado.
    expect(screen.getByText(/da meta de 30/)).toBeInTheDocument();
    expect(screen.getByText(/da meta de R\$\s?56\.970,00/)).toBeInTheDocument();
  });

  it("sem meta configurada, não desenha barra nem cobra alvo", () => {
    render(<StatusDeVendasView status={{ ...STATUS, metas: { vendas: 0, receita: 0 } }} />);

    // Meta zero é "não configurada", não "alvo zero": cobrar 0 faria a tela
    // declarar meta batida com nenhuma venda.
    expect(screen.queryByText(/da meta de/)).not.toBeInTheDocument();
  });

  it("o que está em jogo não inclui desfecho", () => {
    render(<StatusDeVendasView status={STATUS} />);

    // 34 + 22 + 9 + 26 = 91. Somar ganho e perdido responderia "quantos
    // registros existem", que é o total da base logo ao lado.
    expect(screen.getByText(/121 negócios no funil/)).toBeInTheDocument();
    expect(screen.getByText(/91 ainda em jogo/)).toBeInTheDocument();
  });

  it("toda etapa aparece, inclusive a vazia", () => {
    render(
      <StatusDeVendasView status={{ ...STATUS, etapas: [{ nome: "Reabordagem", negocios: 0 }] }} />,
    );

    // "Ninguém aqui" é informação: a etapa some da tela e a soma deixa de
    // fechar com o total da base sem nenhum sinal.
    expect(screen.getByText("Reabordagem")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("os números do período aparecem escritos", () => {
    render(<StatusDeVendasView status={STATUS} />);

    expect(screen.getByText("89")).toBeInTheDocument();
    expect(screen.getByText("31")).toBeInTheDocument();
    expect(screen.getByText("R$ 2.658,00")).toBeInTheDocument();
  });
});
