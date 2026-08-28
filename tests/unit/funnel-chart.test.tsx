import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FunnelChart } from "@/components/charts/funnel-chart";
import type { FunnelBlock } from "@/lib/types";

/**
 * O funil desenhado.
 *
 * O que precisa ser travado aqui não é a aparência — é o que a forma promete:
 * ordem preservada, etapa vazia ainda visível e distinguível de etapa cheia, e
 * todo número escrito, porque uma figura sozinha não atende quem usa leitor de
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

/** A largura da aresta de cima de cada faixa, em pontos percentuais. */
function larguras(container: HTMLElement): number[] {
  return [...container.querySelectorAll<HTMLElement>("[style*='polygon']")].map((el) => {
    const [a, b] = arestas(el.style.clipPath);
    return b - a;
  });
}

describe("FunnelChart", () => {
  it("cada número da figura também aparece escrito", () => {
    const { container } = render(<FunnelChart block={BLOCO} />);

    // A figura é o atalho, não a fonte. Sem o texto, a tela não sobrevive a
    // leitor de tela nem a uma impressão em preto e branco. Cada etapa aparece
    // duas vezes: dentro da faixa e na lista que o telefone mostra no lugar.
    for (const etapa of BLOCO.stages) {
      expect(screen.getAllByText(etapa.label).length).toBeGreaterThan(0);
    }
    expect(screen.getAllByText("100").length).toBeGreaterThan(0);
    expect(within(container).getAllByText("0").length).toBeGreaterThan(0);
  });

  it("mostra a queda em relação à etapa anterior", () => {
    render(<FunnelChart block={BLOCO} />);

    expect(screen.getByText("−50%")).toBeInTheDocument();
    expect(screen.getByText("−100%")).toBeInTheDocument();
  });

  it("a porcentagem sai em número inteiro", () => {
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

    // "−59,22%" ao lado de uma forma geométrica finge uma precisão que a figura
    // não tem.
    expect(screen.getByText("−59%")).toBeInTheDocument();
    expect(screen.queryByText(/59,2/)).not.toBeInTheDocument();
  });

  it("a ordem das larguras acompanha a ordem dos valores", () => {
    const { container } = render(
      <FunnelChart
        block={{
          title: "t",
          stages: [
            { label: "A", value: 400 },
            { label: "B", value: 200 },
            { label: "C", value: 100 },
          ],
        }}
      />,
    );

    const valores = larguras(container);

    // A escala é comprimida de propósito — largura linear com queda forte vira
    // taça de martíni —, mas comprimir não pode inverter: maior é sempre mais
    // largo, ou a figura passa a mentir sobre a ordem do funil.
    for (let i = 1; i < valores.length; i++) {
      expect(valores[i]).toBeLessThan(valores[i - 1]);
    }
  });

  it("etapa zerada continua visível, e não parece cheia", () => {
    const { container } = render(<FunnelChart block={BLOCO} />);

    const formas = [...container.querySelectorAll<HTMLElement>("[style*='polygon']")];
    const cheia = formas[0].style.background;
    const zerada = formas[2].style.background;

    // Largura zero levaria a faixa e o rótulo junto, quando "ninguém chega
    // aqui" é o que o funil precisa mostrar. Mas pintá-la igual às outras faria
    // zero parecer volume: ela sai vazada.
    expect(zerada).toContain("repeating-linear-gradient");
    expect(cheia).not.toContain("repeating-linear-gradient");
  });

  it("avisa que a largura está em escala comprimida", () => {
    render(<FunnelChart block={BLOCO} />);

    // A figura distorce de propósito para caber texto legível. Não dizer isso
    // deixaria a leitura visual mais generosa do que o dado.
    expect(screen.getByText(/escala comprimida/i)).toBeInTheDocument();
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
