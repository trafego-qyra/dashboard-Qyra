/**
 * Paleta categórica dos gráficos.
 *
 * Ordem fixa, nunca ciclada — a cor segue a entidade (canal/métrica), não o
 * rank da linha, então filtrar uma série não repinta as outras.
 *
 * Validada com `scripts/validate_palette.js` (skill dataviz) nas superfícies
 * #ffffff (claro) e #2f2535 (escuro):
 *   lightness band PASS · chroma floor PASS · CVD ΔE 9.3 PASS
 *   normal-vision ΔE 19.9 PASS · contraste ≥ 3:1 PASS
 *
 * Formas com pares não-adjacentes (dispersão, bolha, small multiples) usam no
 * máximo os 3 primeiros slots — acima disso o gate all-pairs reprova.
 */
const SERIES_COLORS = {
  1: "var(--color-series-1)",
  2: "var(--color-series-2)",
  3: "var(--color-series-3)",
  4: "var(--color-series-4)",
  5: "var(--color-series-5)",
} as const;

export type SeriesSlot = keyof typeof SERIES_COLORS;

/**
 * Slots seguros para formas que comparam qualquer par entre si (dispersão,
 * bolha, small multiples): os três primeiros. Acima disso o gate all-pairs
 * reprova — o quarto slot precisa ser dobrado em "Outros" ou facetado.
 */
const ALL_PAIRS_SAFE_SLOTS = 3;

export function seriesColor(slot: SeriesSlot): string {
  return SERIES_COLORS[slot];
}

/** Quantos slots uma forma pode usar sem quebrar o gate de daltonismo. */
export function maxSlotsFor(shape: "adjacent" | "all-pairs"): number {
  return shape === "all-pairs" ? ALL_PAIRS_SAFE_SLOTS : 5;
}
