import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FunnelChart } from "@/components/charts/funnel-chart";
import type { FunnelBlock } from "@/lib/types";

/**
 * O funil desenhado.
 *
 * O que precisa ser travado aqui não é a aparência — é o que a forma promete:
 * largura proporcional, etapa vazia ainda visível, e todo número também
 * escrito em texto, porque uma figura sozinha não atende quem usa leitor de
 * tela nem quem imprime a página.
 */

const BLOCO: FunnelBlock = {
  title: "Do primeiro contato ao pagamento",
  description: "Quantos chegaram a cada etapa.",
  caveat: "Negócio perdido conta apenas na primeira etapa.",
  stages: [
    { label: "Novo lead", value: 100 },
    { label: "Qualificação", value: 50 },
    { label: "Negociação", value: 0 },
    { label: "Venda ganha", value: 0, outcome: "ganho" },
  ],
};

/** As quatro arestas de um `polygon(...)`, em ordem. */
function arestas(estilo: string): number[] {
  return [...estilo.matchAll(/([\d.]+)%\s+(?:0%|100%)/g)].map((m) => Number(m[1]));
}

/** A largura da aresta de cima de cada faixa, em ordem, em pontos percentuais. */
function larguras(container: HTMLElement): number[] {
  return [...container.querySelectorAll<HTMLElement>("[style*='polygon']")].map((el) => {
    const [a, b] = arestas(el.style.clipPath);
    return b - a;
  });
}

describe("FunnelChart", () => {
  it("cada número da figura também aparece escrito", () => {
    render(<FunnelChart block={BLOCO} />);

    // A figura é o atalho, não a fonte. Sem o texto ao lado, a tela não
    // sobrevive a leitor de tela nem a uma impressão em preto e branco.
    for (const etapa of BLOCO.stages) {
      expect(screen.getByText(etapa.label)).toBeInTheDocument();
    }
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText("50")).toBeInTheDocument();
    expect(screen.getAllByText("0")).toHaveLength(2);
  });

  it("mostra a queda em relação à etapa anterior", () => {
    render(<FunnelChart block={BLOCO} />);

    expect(screen.getByText("−50% da anterior")).toBeInTheDocument();
    expect(screen.getByText("−100% da anterior")).toBeInTheDocument();
  });

  it("a porcentagem do topo sai em número inteiro", () => {
    render(
      <FunnelChart
        block={{
          title: "t",
          stages: [
            { label: "A", value: 358 },
            { label: "B", value: 146 },
          ],
        }}
      />,
    );

    // "40,78% do topo" ao lado de uma forma geométrica finge uma precisão que
    // a figura não tem.
    expect(screen.getByText("41% do topo")).toBeInTheDocument();
    expect(screen.queryByText(/40,78/)).not.toBeInTheDocument();
  });

  it("etapa zerada continua visível em vez de sumir", () => {
    const { container } = render(<FunnelChart block={BLOCO} />);

    const zerada = larguras(container).at(-1);

    // Largura zero levaria a lâmina inteira junto, e com ela o rótulo — quando
    // "ninguém chega aqui" é justamente o que o funil precisa mostrar.
    expect(zerada).toBeGreaterThan(0);
  });

  it("a largura acompanha o valor, e nunca alarga para baixo", () => {
    const { container } = render(<FunnelChart block={BLOCO} />);

    const [primeira, segunda] = larguras(container);

    // Metade do valor, metade da largura: a codificação é linear.
    expect(segunda).toBeCloseTo(primeira / 2, 1);
    expect(segunda).toBeLessThan(primeira);
  });

  it("diz o que a figura não consegue mostrar", () => {
    render(<FunnelChart block={BLOCO} />);

    expect(screen.getByText(/conta apenas na primeira etapa/i)).toBeInTheDocument();
  });

  it("sem etapas, não desenha nada", () => {
    const { container } = render(<FunnelChart block={{ title: "t", stages: [] }} />);
    expect(container).toBeEmptyDOMElement();
  });
});
