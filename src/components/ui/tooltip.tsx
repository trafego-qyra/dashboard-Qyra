"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import type * as React from "react";

import { cn } from "@/lib/cn";

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export function TooltipContent({
  className,
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          "z-50 max-w-64 rounded-lg border border-line bg-surface-raised px-3 py-2",
          "text-xs text-ink-secondary shadow-lg",
          "data-[state=delayed-open]:animate-[qy-fade_var(--duration-fast)_var(--ease-out-soft)]",
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}
