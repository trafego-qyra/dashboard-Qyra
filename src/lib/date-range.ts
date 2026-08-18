import type { DateRange } from "./types";

export const PRESETS = {
  "7d": { label: "Últimos 7 dias", days: 7 },
  "14d": { label: "Últimos 14 dias", days: 14 },
  "28d": { label: "Últimos 28 dias", days: 28 },
  "90d": { label: "Últimos 90 dias", days: 90 },
} as const;

export type PresetKey = keyof typeof PRESETS;
const DEFAULT_PRESET: PresetKey = "28d";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

export function daysBetween(range: DateRange): number {
  const from = Date.parse(`${range.from}T00:00:00Z`);
  const to = Date.parse(`${range.to}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000) + 1;
}

/**
 * Intervalo de um preset, terminando ontem — o dia corrente é parcial em todas
 * as plataformas e distorceria a comparação.
 */
export function rangeFromPreset(preset: PresetKey, today = new Date()): DateRange {
  const end = addDays(toIso(today), -1);
  return { from: addDays(end, -(PRESETS[preset].days - 1)), to: end };
}

/** Mesmo tamanho de janela, imediatamente antes — base do "vs. período anterior". */
export function previousRange(range: DateRange): DateRange {
  const size = daysBetween(range);
  return { from: addDays(range.from, -size), to: addDays(range.from, -1) };
}

export function isValidIsoDate(value: string): boolean {
  return ISO_DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

/**
 * Lê o intervalo dos search params. Entrada inválida nunca quebra a tela:
 * cai no preset padrão.
 */
export function parseRange(
  params: { preset?: string; from?: string; to?: string },
  today = new Date(),
): { range: DateRange; preset: PresetKey | "custom" } {
  const { from, to } = params;
  if (from && to && isValidIsoDate(from) && isValidIsoDate(to) && from <= to) {
    return { range: { from, to }, preset: "custom" };
  }

  const preset = (
    params.preset && params.preset in PRESETS ? params.preset : DEFAULT_PRESET
  ) as PresetKey;
  return { range: rangeFromPreset(preset, today), preset };
}

const LABEL = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});

export function formatRange(range: DateRange): string {
  return `${LABEL.format(new Date(`${range.from}T00:00:00Z`))} – ${LABEL.format(
    new Date(`${range.to}T00:00:00Z`),
  )}`;
}

export function formatDayShort(iso: string): string {
  return LABEL.format(new Date(`${iso}T00:00:00Z`));
}

/** Lista de dias do intervalo, em ISO. */
export function eachDay(range: DateRange): string[] {
  const out: string[] = [];
  for (let d = range.from; d <= range.to; d = addDays(d, 1)) out.push(d);
  return out;
}
