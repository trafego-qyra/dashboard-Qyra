import { LogOut } from "lucide-react";
import type * as React from "react";

import { sair } from "@/app/login/actions";
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
          {/* No celular a barra não tem rodapé, então tema e saída moram aqui
              — sem isto, quem abre no telefone não consegue sair. */}
          <div className="flex items-center gap-2 lg:hidden">
            <ThemeToggle />
            <form action={sair}>
              <button
                type="submit"
                aria-label="Sair"
                className="grid size-9 place-items-center rounded-full text-plum-200 transition-colors duration-[var(--duration-fast)] hover:bg-white/8 hover:text-white"
              >
                <LogOut className="size-4" aria-hidden="true" />
              </button>
            </form>
          </div>
        </div>

        <div className="relative">
          <div className="overflow-x-auto px-2 pb-3 [scrollbar-width:none] lg:px-2 lg:pb-0 [&::-webkit-scrollbar]:hidden">
            <Sidebar className="flex-row lg:flex-col" />
          </div>
          {/* Esmaecimento na borda: sinaliza que a lista continua além da tela. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-plum-800 to-transparent lg:hidden"
          />
        </div>

        <div className="relative mt-auto hidden px-3 pb-5 lg:block lg:absolute lg:inset-x-0 lg:bottom-0">
          <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-4">
            <span className="px-1 text-[11px] text-plum-300">Tema</span>
            <ThemeToggle />
          </div>
          {/* Sair fica junto do rodapé, e não no topo: em computador
              compartilhado é o último gesto, não o primeiro. */}
          <form action={sair} className="pt-2">
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-full px-3 py-2 text-left text-plum-200 text-sm transition-colors duration-[var(--duration-fast)] hover:bg-white/8 hover:text-white"
            >
              <LogOut className="size-4 shrink-0" aria-hidden="true" />
              Sair
            </button>
          </form>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-3 py-5 sm:px-4 sm:py-6 lg:px-2 lg:py-4">{children}</main>
    </div>
  );
}
