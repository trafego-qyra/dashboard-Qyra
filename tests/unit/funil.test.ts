import { describe, expect, it } from "vitest";

import { conversaoPorEtapa } from "@/lib/funil";
import type { FunnelBlock } from "@/lib/types";

/**
 * A conversão etapa a etapa.
 *
 * É a tabela que responde "onde o funil aperta". A figura mostra o mesmo, mas
 * mostrar não é dizer: quem lê não mede trapézio com régua, e quem usa leitor
 * de tela não vê a figura nenhuma.
 */

function funil(...valores: Array<[string, number]>): FunnelBlock {
  return { title: "t", stages: valores.map(([label, value]) => ({ label, value })) };
}

describe("conversaoPorEtapa", () => {
  it("mede cada passagem sobre quem chegou à etapa de cima", () => {
    const tabela = conversaoPorEtapa(
      funil(["Novo lead", 200], ["Qualificação", 50], ["Venda ganha", 5]),
    );

    expect(tabela?.rows).toEqual([
      { passagem: "Novo lead → Qualificação", chegaram: 200, seguiram: 50, conversao: 0.25 },
      { passagem: "Qualificação → Venda ganha", chegaram: 50, seguiram: 5, conversao: 0.1 },
    ]);
  });

  it("a porcentagem é a da passagem, não a do topo do funil", () => {
    const tabela = conversaoPorEtapa(funil(["A", 100], ["B", 50], ["C", 25]));

    // Sobre o topo, C seria 25%. A passagem B → C é 50% — metade de quem
    // chegou em B seguiu. Confundir as duas transforma um funil saudável no
    // fim em gargalo aparente, só porque o topo já tinha afunilado antes.
    expect(tabela?.rows.at(-1)).toMatchObject({ conversao: 0.5 });
  });

  it("uma linha por passagem, e não uma por etapa", () => {
    const tabela = conversaoPorEtapa(funil(["A", 10], ["B", 8], ["C", 4], ["D", 1]));

    // A primeira etapa não tem passagem para medir: não existe etapa antes da
    // boca do funil.
    expect(tabela?.rows).toHaveLength(3);
  });

  it("etapa de origem vazia não vira divisão por zero", () => {
    const tabela = conversaoPorEtapa(funil(["A", 4], ["B", 0], ["C", 2]));

    // Acontece quando o desfecho vem de outra contagem que a das etapas. Sem a
    // trava a coluna imprimiria Infinity, que na tela sai como "—" e some.
    expect(tabela?.rows.at(-1)).toMatchObject({ conversao: 0 });
  });

  it("arredonda antes de chegar à tela", () => {
    const tabela = conversaoPorEtapa(funil(["A", 3], ["B", 1]));

    // 1/3 sem arredondar é 0.3333333333333333, e a coluna imprime duas casas:
    // o ruído nunca aparece, mas o número cru vaza para quem copia a tabela.
    expect(tabela?.rows[0].conversao).toBe(0.3333);
  });

  it("sem passagem nenhuma, não devolve tabela", () => {
    // Uma etapa só não é funil, e tabela de zero linhas ocupa a tela sem dizer
    // nada — pior, a tela desenha o estado vazio como se fosse defeito.
    expect(conversaoPorEtapa(funil(["A", 10]))).toBeUndefined();
  });

  it("funil sem ninguém na boca não vira uma tabela de zeros", () => {
    // Período sem negócio nenhum: toda linha sairia "0 de 0, 0%", repetindo o
    // que os indicadores já disseram e sugerindo que a conversão despencou.
    expect(conversaoPorEtapa(funil(["A", 0], ["B", 0]))).toBeUndefined();
  });

  it("a coluna de conversão sai formatada como porcentagem", () => {
    const tabela = conversaoPorEtapa(funil(["A", 10], ["B", 5]));

    // A UI nunca decide formato sozinha: sem isso a tabela imprimiria "0,5".
    expect(tabela?.columns.find((c) => c.key === "conversao")?.format).toBe("percent");
  });
});
