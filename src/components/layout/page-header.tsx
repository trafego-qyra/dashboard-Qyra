import type * as React from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import type { DataSource } from "@/lib/types";

/**
 * Cabeçalho de tela. O título editorial usa a fonte de contraste do brandbook
 * (Larken italic); todo o resto — inclusive número — fica na sans, para não
 * comprometer legibilidade de dado.
 */
export function PageHeader({
  title,
  description,
  source,
  actions,
  className,
}: {
  title: string;
  description: string;
  source?: DataSource;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="min-w-0 space-y-1.5">
        <div className="flex items-center gap-2">
          <h1 className="font-display text-2xl italic text-ink">{title}</h1>
          {source === "mock" ? (
            <Badge tone="warning" title="Nenhuma credencial configurada para este canal">
              Dados de demonstração
            </Badge>
          ) : null}
        </div>
        <p className="max-w-2xl text-sm text-ink-muted">{description}</p>
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}
