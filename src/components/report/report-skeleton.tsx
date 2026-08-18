import { ChartSkeleton, Skeleton, StatTileSkeleton, TableSkeleton } from "@/components/ui/skeleton";

/**
 * Esqueleto de uma tela de relatório.
 *
 * Espelha a geometria do conteúdo real (5 tiles, 1 gráfico, 1 tabela) para que
 * a troca do skeleton pelo dado não desloque nada na tela.
 */
export function ReportSkeleton({ tables = 1 }: { tables?: number }) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <div className="sm:col-span-2 xl:col-span-2">
          <StatTileSkeleton />
        </div>
        {Array.from({ length: 4 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: placeholder estático sem identidade
          <StatTileSkeleton key={i} />
        ))}
      </div>

      <ChartSkeleton />

      {Array.from({ length: tables }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: placeholder estático sem identidade
        <TableSkeleton key={i} />
      ))}
    </div>
  );
}
