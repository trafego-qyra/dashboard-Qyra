"use client";

import { LayoutGrid } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { QyraLogo } from "@/components/brand/logo";
import { CHANNELS } from "@/lib/channels";
import { cn } from "@/lib/cn";

/**
 * Navegação principal.
 *
 * O slab escuro de cantos arredondados vem do cabeçalho do manual; aqui ele
 * vira a âncora vertical da tela. O ponto colorido ao lado de cada canal usa o
 * mesmo slot que o canal ocupa nos gráficos — a cor é a mesma em toda a
 * aplicação.
 */
const NAV = [
  { href: "/", label: "Visão geral", icon: LayoutGrid, slot: null },
  ...CHANNELS.map((c) => ({ href: c.href, label: c.label, icon: null, slot: c.slot })),
];

export function Sidebar({ className }: { className?: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // O período escolhido acompanha a navegação — trocar de canal não reseta o filtro.
  const query = searchParams.toString();

  return (
    <nav aria-label="Canais" className={cn("flex flex-col gap-1", className)}>
      {NAV.map((item) => {
        const active = pathname === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={query ? `${item.href}?${query}` : item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex items-center gap-3 rounded-full px-3 py-2 text-sm",
              "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out-soft)]",
              active
                ? "bg-[color-mix(in_oklab,var(--color-lilac-500)_22%,transparent)] text-white"
                : "text-plum-200 hover:bg-white/8 hover:text-white",
            )}
          >
            {Icon ? (
              <Icon className="size-4 shrink-0" aria-hidden="true" />
            ) : (
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: `var(--color-series-${item.slot})` }}
              />
            )}
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function SidebarBrand() {
  return (
    <Link href="/" className="flex items-center gap-2 px-3 text-white" aria-label="QYRA — início">
      <QyraLogo className="h-5" />
      <span className="sr-only">Dashboard</span>
    </Link>
  );
}
