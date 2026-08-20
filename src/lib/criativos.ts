/**
 * Um anúncio com os números que decidem a ordem.
 *
 * Separado de `ContentCard` de propósito: o cartão é modelo de tela, com
 * métricas já rotuladas. A ordenação precisa dos números crus, e é assunto de
 * anúncio — publicação orgânica se ordena por alcance, não por custo por lead.
 */
export interface AdCreative {
  id: string;
  name: string;
  campaign?: string;
  spend: number;
  impressions: number;
  ctr: number;
  cpm: number;
  linkClicks: number;
  leads: number;
  cpl: number;
  video?: { reproducoes: number; p25: number; p50: number; p75: number; p100: number };
}

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
export function ordenarCriativos<T extends { leads: number; cpl: number; spend: number }>(
  criativos: T[],
): T[] {
  const houveLead = criativos.some((c) => c.leads > 0);
  return [...criativos].sort((a, b) =>
    houveLead ? b.leads - a.leads || a.cpl - b.cpl : b.spend - a.spend,
  );
}

/** Quantas peças a tela mostra. Passa disso vira catálogo, não leitura. */
export const MAX_CRIATIVOS = 12;
