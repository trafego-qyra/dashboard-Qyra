"use client";

import { formatDayShort } from "@/lib/date-range";
import { formatMetric } from "@/lib/format";
import type { SeriesDef } from "@/lib/types";
import { seriesColor } from "./palette";

interface PayloadItem {
  dataKey?: string | number;
  value?: number | string;
}

/**
 * Tooltip compartilhado. Um gráfico HTML é interativo por natureza — a camada
 * de hover é padrão, não enfeite.
 */
export function ChartTooltip({
  active,
  label,
  payload,
  defs,
  axis = "date",
}: {
  active?: boolean;
  label?: string | number;
  payload?: PayloadItem[];
  defs: SeriesDef[];
  axis?: "date" | "hour";
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-xl border border-line bg-surface-raised px-3 py-2 shadow-lg">
      <p className="text-[11px] font-medium text-ink-muted">
        {typeof label !== "string" ? label : axis === "hour" ? `${label}h` : formatDayShort(label)}
      </p>
      <ul className="mt-1.5 space-y-1">
        {payload.map((item) => {
          const def = defs.find((d) => d.key === item.dataKey);
          if (!def) return null;
          return (
            <li key={def.key} className="flex items-center gap-2 text-xs">
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: seriesColor(def.slot) }}
              />
              <span className="text-ink-secondary">{def.label}</span>
              <span className="ml-auto font-medium tabular text-ink">
                {formatMetric(Number(item.value), def.format)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Legenda textual. Sempre presente com 2+ séries; identidade nunca é só cor. */
export function ChartLegend({ defs }: { defs: SeriesDef[] }) {
  if (defs.length < 2) return null;

  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {defs.map((def) => (
        <li key={def.key} className="flex items-center gap-1.5 text-xs text-ink-secondary">
          <span
            aria-hidden="true"
            className="size-2 rounded-full"
            style={{ backgroundColor: seriesColor(def.slot) }}
          />
          {def.label}
        </li>
      ))}
    </ul>
  );
}
