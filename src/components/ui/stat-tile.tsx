import { Info } from "lucide-react";

import { cn } from "@/lib/cn";
import { formatMetric } from "@/lib/format";
import type { Kpi } from "@/lib/types";
import { Delta } from "./delta";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

/**
 * Stat tile: um número é um número. Quando a história é um valor só, ela não
 * vira gráfico — vira este componente.
 */
export function StatTile({
  kpi,
  emphasis = false,
  className,
}: {
  kpi: Kpi;
  /** Destaca o KPI principal da tela. No máximo um por grupo. */
  emphasis?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "group rounded-[var(--radius-card)] border border-line bg-surface p-5",
        "transition-[border-color,box-shadow] duration-[var(--duration-base)] ease-[var(--ease-out-soft)]",
        "hover:border-line-strong hover:shadow-[0_8px_28px_-20px_rgba(47,37,53,0.4)]",
        className,
      )}
    >
      <div className="flex items-center gap-1.5">
        <p className="text-xs font-medium text-ink-secondary">{kpi.label}</p>
        {kpi.hint ? (
          <Tooltip>
            <TooltipTrigger
              aria-label={`Como ${kpi.label} é calculado`}
              className="text-ink-muted transition-colors hover:text-ink"
            >
              <Info className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent>{kpi.hint}</TooltipContent>
          </Tooltip>
        ) : null}
      </div>

      {/* O valor escala com o container: moeda longa (R$ 1.234.567,89) não pode
          estourar a borda nem quebrar em duas linhas dentro do tile. */}
      <p
        className={cn(
          "mt-3 font-semibold tracking-tight text-ink",
          emphasis ? "text-[clamp(1.5rem,2.4vw,2.25rem)]" : "text-[clamp(1.25rem,1.6vw,1.5rem)]",
        )}
      >
        {formatMetric(kpi.value, kpi.format)}
      </p>

      <div className="mt-2">
        <Delta
          value={kpi.value}
          previousValue={kpi.previousValue}
          lowerIsBetter={kpi.lowerIsBetter}
        />
      </div>
    </div>
  );
}
