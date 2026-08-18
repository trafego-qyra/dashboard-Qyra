import type * as React from "react";

import { cn } from "@/lib/cn";

/**
 * Skeleton com shimmer. Ele espelha a geometria do conteúdo real — mesma
 * altura, mesmo raio — para que a troca não empurre o layout.
 */
export function Skeleton({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      aria-hidden="true"
      style={style}
      className={cn("relative overflow-hidden rounded-md bg-surface-sunken", className)}
    >
      <div
        className={cn(
          "absolute inset-0 -translate-x-full",
          "bg-gradient-to-r from-transparent via-[var(--qy-line)] to-transparent",
          "motion-safe:animate-[qy-shimmer_1.6s_infinite]",
        )}
      />
    </div>
  );
}

/** Placeholder de um stat tile, com as mesmas medidas do componente real. */
export function StatTileSkeleton() {
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-4 h-8 w-32" />
      <Skeleton className="mt-3 h-3 w-20" />
    </div>
  );
}

export function ChartSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("rounded-[var(--radius-card)] border border-line bg-surface p-5", className)}
    >
      <Skeleton className="h-3 w-40" />
      <Skeleton className="mt-5 h-[260px] w-full rounded-lg" />
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
      <Skeleton className="h-3 w-32" />
      <div className="mt-5 space-y-3">
        {Array.from({ length: rows }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: placeholder estático sem identidade
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    </div>
  );
}
