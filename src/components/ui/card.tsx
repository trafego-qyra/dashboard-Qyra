import type * as React from "react";

import { cn } from "@/lib/cn";

/**
 * Superfície base do produto. Raio de 20px e hairline de 1px espelham os
 * cantos generosos do manual sem imitar o slab do slide.
 */
export function Card({ className, ...props }: React.ComponentProps<"section">) {
  return (
    <section
      className={cn(
        "rounded-[var(--radius-card)] border border-line bg-surface",
        "shadow-[0_1px_2px_rgba(47,37,53,0.04),0_8px_24px_-16px_rgba(47,37,53,0.18)]",
        "transition-shadow duration-[var(--duration-base)] ease-[var(--ease-out-soft)]",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.ComponentProps<"header">) {
  return (
    <header
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 px-4 pt-4 pb-3 sm:px-5 sm:pt-5",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return <h2 className={cn("text-sm font-semibold text-ink", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("text-xs text-ink-muted", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("px-4 pb-4 sm:px-5 sm:pb-5", className)} {...props} />;
}
