import { describe, expect, it } from "vitest";

import { maxSlotsFor, seriesColor } from "@/components/charts/palette";
import { CHANNELS } from "@/lib/channels";

/**
 * A paleta foi validada com `scripts/validate_palette.js` (skill dataviz) nas
 * superfícies #ffffff e #2f2535. Estes testes travam as duas invariantes que a
 * validação assume — se alguém acrescentar um sexto slot ou repetir uma cor
 * entre canais, o gate de daltonismo deixa de valer e o build acusa.
 */
describe("paleta categórica", () => {
  it("expõe exatamente 5 slots para formas de pares adjacentes", () => {
    expect(maxSlotsFor("adjacent")).toBe(5);
  });

  it("limita a 3 slots as formas que comparam qualquer par", () => {
    expect(maxSlotsFor("all-pairs")).toBe(3);
  });

  it("dá um slot distinto a cada canal — cor segue a entidade, não o rank", () => {
    const slots = CHANNELS.map((c) => c.slot);
    expect(new Set(slots).size).toBe(CHANNELS.length);
  });

  it("mantém todo canal dentro do intervalo validado", () => {
    for (const channel of CHANNELS) {
      expect(channel.slot).toBeGreaterThanOrEqual(1);
      expect(channel.slot).toBeLessThanOrEqual(maxSlotsFor("adjacent"));
      expect(seriesColor(channel.slot)).toMatch(/^var\(--color-series-[1-5]\)$/);
    }
  });
});
