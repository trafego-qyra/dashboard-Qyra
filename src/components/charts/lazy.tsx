"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * Carregamento tardio dos gráficos.
 *
 * O Recharts responde por ~145 kB do bundle — mais do que todo o resto da
 * aplicação junta. Carregar sob demanda tira esse peso do First Load e mantém
 * o orçamento de performance (docs/qualidade.md) folgado. O fallback tem a
 * altura exata do gráfico para não empurrar o layout na troca.
 */

function ChartFallback({ height }: { height: number }) {
  return <Skeleton className="w-full rounded-lg" style={{ height }} />;
}

export const TrendSmallMultiples = dynamic(
  () => import("./trend-chart").then((m) => m.TrendSmallMultiples),
  {
    ssr: false,
    loading: () => (
      <div className="grid gap-6 md:grid-cols-2">
        <ChartFallback height={200} />
        <ChartFallback height={200} />
      </div>
    ),
  },
);

export const ChannelBars = dynamic(() => import("./channel-bars").then((m) => m.ChannelBars), {
  ssr: false,
  loading: () => <ChartFallback height={240} />,
});
