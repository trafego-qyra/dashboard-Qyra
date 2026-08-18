import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
  {
    variants: {
      tone: {
        neutral: "bg-surface-sunken text-ink-secondary",
        accent: "bg-[var(--qy-accent-soft)] text-accent",
        positive: "bg-[color-mix(in_oklab,var(--qy-positive)_14%,transparent)] text-positive",
        negative: "bg-[color-mix(in_oklab,var(--qy-negative)_14%,transparent)] text-negative",
        warning: "bg-[color-mix(in_oklab,var(--qy-warning)_16%,transparent)] text-warning",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
