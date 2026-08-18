import { cn } from "@/lib/cn";
import { computeDelta } from "@/lib/format";

/**
 * Indicador de variação.
 *
 * A direção é o chevron da marca (o "A" de QYRA) — ícone + rótulo textual, de
 * modo que a leitura nunca depende só da cor. `lowerIsBetter` inverte a
 * semântica: CPL caindo é verde.
 */
export function Delta({
  value,
  previousValue,
  lowerIsBetter,
  className,
  suffix = "vs. anterior",
}: {
  value: number;
  previousValue?: number;
  lowerIsBetter?: boolean;
  className?: string;
  suffix?: string;
}) {
  const delta = computeDelta(value, previousValue, lowerIsBetter);

  if (delta.ratio === null) {
    return <span className={cn("text-xs text-ink-muted", className)}>Sem base de comparação</span>;
  }

  const tone =
    delta.tone === "positive"
      ? "text-positive"
      : delta.tone === "negative"
        ? "text-negative"
        : "text-ink-muted";

  return (
    <span
      title="Comparado ao período anterior, de mesmo tamanho"
      className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-xs", className)}
    >
      <span className={cn("inline-flex items-center gap-1 font-medium tabular", tone)}>
        <Chevron direction={delta.direction} />
        {delta.label}
      </span>
      <span className="text-ink-muted">{suffix}</span>
    </span>
  );
}

function Chevron({ direction }: { direction: "up" | "down" | "flat" }) {
  if (direction === "flat") {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3">
        <path d="M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={cn("size-3", direction === "down" && "rotate-180")}
    >
      <path
        d="M3 11 8 5l5 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
