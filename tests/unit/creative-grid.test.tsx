import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CreativeGrid } from "@/components/report/creative-grid";
import type { ContentCard } from "@/lib/types";

/**
 * O cartão de peça, com atenção ao carrossel.
 *
 * O caso que motivou o teste: álbum do Instagram aparecendo como imagem única,
 * porque a Meta devolve o carrossel inteiro numa mídia só.
 */

const BASE: ContentCard = {
  id: "1",
  title: "Cinco mitos sobre emagrecimento",
  subtitle: "Carrossel · 15/08/2026",
  imageUrl: "/publicacoes/101/imagem",
  link: "https://www.instagram.com/p/abc/",
  linkLabel: "Ver no Instagram",
  metrics: [{ label: "Alcance", value: 1200, format: "integer" }],
};

const CARROSSEL: ContentCard = {
  ...BASE,
  galeria: ["/publicacoes/101/imagem", "/publicacoes/102/imagem", "/publicacoes/103/imagem"],
};

/** jsdom não implementa rolagem programática, e o carrossel a usa nas setas. */
beforeEach(() => {
  Element.prototype.scrollTo = vi.fn();
});

describe("CreativeGrid — carrossel", () => {
  it("renderiza todas as artes do álbum, não só a capa", () => {
    render(<CreativeGrid criativos={[CARROSSEL]} />);

    for (let i = 1; i <= 3; i++) {
      expect(screen.getByAltText(new RegExp(`Arte ${i} de 3`))).toBeTruthy();
    }
  });

  it("anuncia quantas artes existem antes de a pessoa tentar rolar", () => {
    render(<CreativeGrid criativos={[CARROSSEL]} />);

    // Sem contador, um carrossel parado se confunde com imagem única — foi
    // exatamente assim que o problema passou despercebido.
    expect(screen.getByText("1/3")).toBeTruthy();
  });

  it("dá setas para quem está no mouse, com a primeira desabilitada", async () => {
    render(<CreativeGrid criativos={[CARROSSEL]} />);

    const anterior = screen.getByRole("button", { name: /arte anterior/i }) as HTMLButtonElement;
    const proxima = screen.getByRole("button", { name: /próxima arte/i });

    expect(anterior.disabled).toBe(true);
    await userEvent.click(proxima);
    expect(Element.prototype.scrollTo).toHaveBeenCalled();
  });

  it("a região rolável recebe foco pelo teclado", () => {
    render(<CreativeGrid criativos={[CARROSSEL]} />);

    const regiao = screen.getByRole("group", { name: /carrossel com 3 artes/i });
    // Só as setas não bastam: quem navega por teclado precisa alcançar a
    // rolagem em si.
    expect(regiao.getAttribute("tabindex")).toBe("0");
  });

  it("não envolve o carrossel num link — arrastar abriria o post", () => {
    render(<CreativeGrid criativos={[CARROSSEL]} />);

    const links = screen.getAllByRole("link");
    const regiao = screen.getByRole("group", { name: /carrossel/i });
    expect(links.some((link) => link.contains(regiao))).toBe(false);
    // O acesso ao post continua existindo, pelo botão do rodapé do cartão.
    expect(links.some((link) => /ver no instagram/i.test(link.textContent ?? ""))).toBe(true);
  });
});

describe("CreativeGrid — peça única", () => {
  it("mantém a arte clicável quando não há carrossel", () => {
    render(<CreativeGrid criativos={[BASE]} />);

    expect(screen.queryByRole("group", { name: /carrossel/i })).toBeNull();
    expect(screen.getByAltText(/Arte de Cinco mitos/)).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /ver no instagram/i }).length).toBeGreaterThan(0);
  });

  it("uma arte só não vira carrossel", () => {
    render(<CreativeGrid criativos={[{ ...BASE, galeria: ["/publicacoes/101/imagem"] }]} />);

    // Setas e contador para uma imagem só seriam ruído.
    expect(screen.queryByRole("button", { name: /próxima arte/i })).toBeNull();
  });
});
