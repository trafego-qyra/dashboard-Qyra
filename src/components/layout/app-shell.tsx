import type * as React from "react";

import { LightBlock } from "@/components/brand/light-block";
import { Sidebar, SidebarBrand } from "./sidebar";
import { ThemeToggle } from "./theme-toggle";

/**
 * Casca da aplicação.
 *
 * O slab escuro de cantos generosos é a tradução direta do cabeçalho do
 * manual. No desktop ele é a coluna de navegação; no mobile vira uma barra
 * superior com a navegação rolável — mesma superfície, mesma cor, sem inventar
 * um segundo padrão.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh lg:flex lg:gap-6 lg:p-4">
      <aside
        className="relative overflow-hidden bg-plum-800 text-white lg:sticky lg:top-4 lg:h-[calc(100dvh-2rem)] lg:w-64 lg:shrink-0 lg:rounded-[var(--radius-slab)]"
        aria-label="Navegação"
      >
        <LightBlock className="opacity-60" />
        <div className="relative flex items-center justify-between gap-4 px-4 py-4 lg:block lg:px-3 lg:py-6">
          <SidebarBrand />
          <div className="lg:hidden">
            <ThemeToggle />
          </div>
        </div>

        <div className="relative overflow-x-auto px-2 pb-3 lg:px-2 lg:pb-0">
          <Sidebar className="flex-row lg:flex-col" />
        </div>

        <div className="relative mt-auto hidden px-3 pb-5 lg:block lg:absolute lg:inset-x-0 lg:bottom-0">
          <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-4">
            <span className="px-1 text-[11px] text-plum-300">Tema</span>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 lg:px-2 lg:py-4">{children}</main>
    </div>
  );
}
