import { TrendSmallMultiples } from "@/components/charts/lazy";
import { Notices } from "@/components/layout/notices";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { StatTile } from "@/components/ui/stat-tile";
import type { ChannelReport } from "@/lib/types";

/**
 * Corpo de uma tela de canal.
 *
 * As quatro telas de canal compartilham exatamente esta composição porque a
 * estrutura do dado é a mesma (`ChannelReport`). O que varia — métricas,
 * tabelas, rótulos — vem do relatório, não de props de configuração. É a
 * fronteira certa do DRY aqui: um componente, zero flags de variação.
 */
export function ChannelView({
  report,
  description,
  actions,
}: {
  report: ChannelReport;
  description: string;
  actions?: React.ReactNode;
}) {
  const [primary, ...rest] = report.kpis;

  return (
    <div className="space-y-6">
      <PageHeader
        title={report.label}
        description={description}
        source={report.source}
        actions={actions}
      />

      <Notices notices={report.notices} />

      <section
        aria-label="Indicadores"
        className="grid gap-4 qy-stagger sm:grid-cols-2 xl:grid-cols-6"
      >
        {primary ? (
          <StatTile kpi={primary} emphasis className="sm:col-span-2 xl:col-span-2" />
        ) : null}
        {rest.map((kpi) => (
          <StatTile key={kpi.key} kpi={kpi} />
        ))}
      </section>

      <Card className="qy-rise">
        <CardHeader>
          <div>
            <CardTitle>Evolução diária</CardTitle>
            <CardDescription>
              Uma escala por métrica — grandezas diferentes nunca dividem o mesmo eixo.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <TrendSmallMultiples data={report.series} defs={report.seriesDefs} />
        </CardContent>
      </Card>

      {report.tables.map((table) => (
        <Card key={table.title} className="qy-rise">
          <CardHeader>
            <div>
              <CardTitle>{table.title}</CardTitle>
              {table.description ? <CardDescription>{table.description}</CardDescription> : null}
            </div>
          </CardHeader>
          <CardContent className="px-2">
            <DataTable block={table} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
