"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { cn } from "@/lib/cn";

const OPTIONS = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Escuro", icon: Moon },
  { value: "system", label: "Sistema", icon: Monitor },
] as const;

/**
 * Alternador de tema. Renderiza um placeholder do mesmo tamanho antes da
 * montagem — o tema real só é conhecido no cliente, e trocar o ícone depois
 * causaria salto de layout.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted)
    return <div className="h-8 w-[6.5rem] rounded-full bg-white/10" aria-hidden="true" />;

  return (
    <div
      role="group"
      aria-label="Tema"
      className="inline-flex items-center gap-0.5 rounded-full bg-white/10 p-0.5"
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          aria-pressed={theme === value}
          aria-label={label}
          title={label}
          onClick={() => setTheme(value)}
          className={cn(
            "rounded-full p-1.5 transition-colors duration-[var(--duration-fast)]",
            theme === value ? "bg-white/90 text-plum-800" : "text-plum-200 hover:text-white",
          )}
        >
          <Icon className="size-3.5" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
