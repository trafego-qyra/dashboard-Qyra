import type { CreativeCard } from "./types";

/**
 * A ordem dos "melhores criativos".
 *
 * "Melhor" é o que trouxe resultado barato, não o que gastou mais: ordena por
 * leads e desempata pelo menor custo por lead. Sem nenhum lead atribuído no
 * período, cai para investimento — é o único critério que resta, e a tela diz
 * qual está em uso.
 *
 * Mora aqui, e não no conector, porque a demonstração precisa obedecer à mesma
 * regra que a legenda anuncia. Quando cada lado ordenava por conta própria, o
 * mock listava na ordem em que os anúncios foram escritos.
 */
export function ordenarCriativos(criativos: CreativeCard[]): CreativeCard[] {
  const houveLead = criativos.some((c) => c.leads > 0);
  return [...criativos].sort((a, b) =>
    houveLead ? b.leads - a.leads || a.cpl - b.cpl : b.spend - a.spend,
  );
}

/** Quantos criativos a tela mostra. Passa disso vira catálogo, não leitura. */
export const MAX_CRIATIVOS = 12;
