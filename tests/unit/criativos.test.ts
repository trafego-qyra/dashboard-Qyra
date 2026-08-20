import { describe, expect, it } from "vitest";

import { type AdCreative, ordenarCriativos } from "@/lib/criativos";

function criativo(parcial: Partial<AdCreative> & { name: string }): AdCreative {
  return {
    id: parcial.name,
    spend: 0,
    impressions: 0,
    ctr: 0,
    cpm: 0,
    linkClicks: 0,
    leads: 0,
    cpl: 0,
    ...parcial,
  };
}

describe("ordem dos melhores criativos", () => {
  it("põe quem trouxe mais lead na frente, não quem gastou mais", () => {
    const ordenado = ordenarCriativos([
      criativo({ name: "caro", spend: 9000, leads: 2, cpl: 4500 }),
      criativo({ name: "produtivo", spend: 500, leads: 40, cpl: 12.5 }),
    ]);

    // "Melhor" é resultado, não volume: um anúncio que queimou 9 mil por 2 leads
    // não abre a lista só porque é o maior número da tela.
    expect(ordenado.map((c) => c.name)).toEqual(["produtivo", "caro"]);
  });

  it("desempata pelo menor custo por lead", () => {
    const ordenado = ordenarCriativos([
      criativo({ name: "b", spend: 600, leads: 20, cpl: 30 }),
      criativo({ name: "a", spend: 200, leads: 20, cpl: 10 }),
    ]);

    expect(ordenado.map((c) => c.name)).toEqual(["a", "b"]);
  });

  it("sem nenhum lead no período, ordena por investimento", () => {
    const ordenado = ordenarCriativos([
      criativo({ name: "pequeno", spend: 100 }),
      criativo({ name: "grande", spend: 900 }),
    ]);

    // Com cpl zerado em todos, ordenar por cpl deixaria a lista na ordem de
    // chegada — que não é ordem nenhuma.
    expect(ordenado.map((c) => c.name)).toEqual(["grande", "pequeno"]);
  });

  it("não altera a lista recebida", () => {
    const original = [
      criativo({ name: "a", leads: 1, cpl: 10 }),
      criativo({ name: "b", leads: 9, cpl: 2 }),
    ];
    ordenarCriativos(original);

    expect(original.map((c) => c.name)).toEqual(["a", "b"]);
  });
});
