"use client";

import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/cn";

/**
 * Botão do produto. Inclui estado de carregamento porque toda ação assíncrona
 * precisa de feedback — sem isso o usuário clica duas vezes.
 */
const buttonVariants = cva(
  cn(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full",
    "text-sm font-medium select-none",
    "transition-[background-color,color,border-color,box-shadow,transform]",
    "duration-[var(--duration-fast)] ease-[var(--ease-out-soft)]",
    "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:size-4 [&_svg]:shrink-0",
  ),
  {
    variants: {
      variant: {
        primary: "bg-accent text-[var(--qy-accent-ink)] hover:bg-lilac-600 dark:hover:bg-lilac-300",
        brand: "bg-brand text-[var(--qy-brand-ink)] hover:opacity-90",
        outline: "border border-line-strong bg-surface text-ink hover:bg-surface-sunken",
        ghost: "text-ink-secondary hover:bg-surface-sunken hover:text-ink",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-9 px-4",
        lg: "h-11 px-6",
        icon: "size-9",
      },
    },
    defaultVariants: { variant: "outline", size: "md" },
  },
);

export interface ButtonProps
  extends React.ComponentProps<"button">,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Mostra o spinner e bloqueia o clique. */
  loading?: boolean;
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  // `asChild` delega a renderização ao filho (um <Link>, por exemplo). O Slot
  // exige exatamente um elemento filho, então o spinner não entra nesse caminho
  // — links não têm estado de carregamento próprio.
  if (asChild) {
    return (
      <Slot className={cn(buttonVariants({ variant, size }), className)} {...props}>
        {children}
      </Slot>
    );
  }

  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={cn("size-4 animate-spin", className)}>
      <circle
        cx="8"
        cy="8"
        r="6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.25"
      />
      <path
        d="M8 1.5a6.5 6.5 0 0 1 6.5 6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
