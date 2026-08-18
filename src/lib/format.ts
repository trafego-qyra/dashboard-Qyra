import type { MetricFormat } from "./types";

const LOCALE = "pt-BR";

const CURRENCY = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 2,
});

const CURRENCY_COMPACT = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

const INTEGER = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const DECIMAL = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const COMPACT = new Intl.NumberFormat(LOCALE, {
  notation: "compact",
  maximumFractionDigits: 1,
});
const PERCENT = new Intl.NumberFormat(LOCALE, {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
});

/** `duration` chega em segundos e sai como `2m 13s`. */
function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
}

export function formatMetric(
  value: number | null | undefined,
  format: MetricFormat,
  options: { compact?: boolean } = {},
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";

  switch (format) {
    case "currency":
      return options.compact && Math.abs(value) >= 10_000
        ? CURRENCY_COMPACT.format(value)
        : CURRENCY.format(value);
    case "integer":
      return options.compact && Math.abs(value) >= 10_000
        ? COMPACT.format(value)
        : INTEGER.format(value);
    case "decimal":
      return DECIMAL.format(value);
    case "percent":
      return PERCENT.format(value);
    case "ratio":
      return `${DECIMAL.format(value)}x`;
    case "duration":
      return formatDuration(value);
  }
}

/**
 * Eixos e ticks: sempre compactos.
 *
 * Moeda sai sem o símbolo — repetir "R$" em cada tick rouba largura do plot e
 * não informa nada. A unidade aparece uma vez, no rótulo do painel.
 */
export function formatAxis(value: number, format: MetricFormat): string {
  if (format === "percent") return PERCENT.format(value);
  if (format === "duration") return formatDuration(value);
  return COMPACT.format(value);
}

/** Sufixo de unidade do painel, quando o eixo sozinho não diz qual é. */
export function unitLabel(format: MetricFormat): string | null {
  if (format === "currency") return "R$";
  if (format === "duration") return "min";
  return null;
}

export interface Delta {
  /** Variação relativa (0.12 = +12%). `null` quando não há base comparável. */
  ratio: number | null;
  direction: "up" | "down" | "flat";
  /** Leitura de negócio, já considerando `lowerIsBetter`. */
  tone: "positive" | "negative" | "neutral";
  label: string;
}

export function computeDelta(
  current: number,
  previous: number | undefined,
  lowerIsBetter = false,
): Delta {
  if (previous === undefined || !Number.isFinite(previous) || previous === 0) {
    return { ratio: null, direction: "flat", tone: "neutral", label: "sem base" };
  }

  const ratio = (current - previous) / Math.abs(previous);
  // Abaixo de 0,5% a variação é ruído: não pinta de verde nem de vermelho.
  if (Math.abs(ratio) < 0.005) {
    return { ratio, direction: "flat", tone: "neutral", label: "estável" };
  }

  const direction = ratio > 0 ? "up" : "down";
  const isGood = lowerIsBetter ? direction === "down" : direction === "up";

  return {
    ratio,
    direction,
    tone: isGood ? "positive" : "negative",
    label: `${ratio > 0 ? "+" : ""}${PERCENT.format(ratio)}`,
  };
}
