import type * as React from "react";

import { cn } from "@/lib/cn";

/**
 * Estado vazio. Sempre diz o que aconteceu, por que, e qual é a próxima ação —
 * um ícone com "sem dados" não ajuda ninguém a resolver nada.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-[var(--radius-card)]",
        "border border-dashed border-line-strong bg-surface-sunken/60 px-6 py-12 text-center",
        className,
      )}
    >
      {icon ? <div className="text-ink-muted [&_svg]:size-6">{icon}</div> : null}
      <div className="space-y-1">
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="mx-auto max-w-sm text-xs leading-relaxed text-ink-muted">{description}</p>
      </div>
      {action}
    </div>
  );
}
