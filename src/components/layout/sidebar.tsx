"use client";

import {
  ChartLine,
  HandCoins,
  Heart,
  LayoutGrid,
  type LucideIcon,
  Megaphone,
  MousePointerClick,
  Search,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { QyraLogo } from "@/components/brand/logo";
import { RELATORIOS } from "@/lib/channels";
import { cn } from "@/lib/cn";

/**
 * O que cada canal é, em ícone.
 *
 * Antes o canal vinha como bolinha na cor do slot que ele ocupa nos gráficos.
 * Ligava as duas coisas, mas ao preço de quatro cores fortes empilhadas fora
 * da paleta da marca, num painel que já é roxo — e a bolinha não dizia nada
 * sobre o canal, só repetia uma legenda.
 *
 * O ícone diz. A cor continua identificando a série onde ela tem função: no
 * gráfico, ao lado do número.
 */
const ICONE: Record<string, LucideIcon> = {
  "meta-ads": Megaphone,
  "google-ads": Search,
  ga4: ChartLine,
  organico: Heart,
  vendas: HandCoins,
};

/**
 * Navegação principal.
 *
 * O slab escuro de cantos arredondados vem do cabeçalho do manual; aqui ele
 * vira a âncora vertical da tela.
 */
const NAV = [
  { href: "/", label: "Visão geral", icon: LayoutGrid },
  ...RELATORIOS.map((c) => ({ href: c.href, label: c.label, icon: ICONE[c.id] })),
  // Fora de CHANNELS de propósito: não é canal de aquisição e não produz
  // relatório de período — é o que acontece depois que a pessoa chega.
  { href: "/comportamento", label: "Comportamento", icon: MousePointerClick },
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
            <Icon className="size-4 shrink-0" aria-hidden="true" />
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
