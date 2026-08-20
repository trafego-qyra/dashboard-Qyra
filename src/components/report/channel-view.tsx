import { TrendSmallMultiples } from "@/components/charts/lazy";
import { Notices } from "@/components/layout/notices";
import { PageHeader } from "@/components/layout/page-header";
import { CreativeGrid } from "@/components/report/creative-grid";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { StatTile } from "@/components/ui/stat-tile";
import { avisosVisiveis } from "@/lib/avisos";
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
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        title={report.label}
        description={description}
        source={report.source}
        periodLabel={report.periodLabel}
        actions={actions}
      />

      {/* Filtra aqui, e não só dentro de `Notices`: o que chega ao componente
          cliente é serializado no HTML, então o encanamento apareceria no
          código-fonte da página mesmo sem ser renderizado. */}
      <Notices notices={avisosVisiveis(report.notices)} />

      <section
        aria-label="Indicadores"
        className="grid grid-cols-2 gap-3 qy-stagger [&>*:last-child:nth-child(odd)]:col-span-2 sm:gap-4 lg:grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] lg:[&>*:last-child:nth-child(odd)]:col-span-1"
      >
        {primary ? <StatTile kpi={primary} emphasis /> : null}
        {rest.map((kpi) => (
          <StatTile key={kpi.key} kpi={kpi} />
        ))}
      </section>

      <Card className="qy-rise">
        <CardHeader>
          <div>
            <CardTitle>
              {report.seriesAxis === "hour" ? "Desempenho por hora do dia" : "Evolução diária"}
            </CardTitle>
            <CardDescription>
              {report.seriesAxis === "hour"
                ? "Somado nos dias do período. É o recorte que o export sustenta — ele não traz quebra por data."
                : "Uma escala por métrica — grandezas diferentes nunca dividem o mesmo eixo."}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <TrendSmallMultiples
            data={report.series}
            defs={report.seriesDefs}
            axis={report.seriesAxis ?? "date"}
          />
        </CardContent>
      </Card>

      {report.creatives && report.creatives.length > 0 ? (
        <Card className="qy-rise">
          <CardHeader>
            <div>
              <CardTitle>{report.creativesLabel?.title ?? "Melhores criativos"}</CardTitle>
              {report.creativesLabel?.description ? (
                <CardDescription>{report.creativesLabel.description}</CardDescription>
              ) : null}
            </div>
          </CardHeader>
          <CardContent>
            <CreativeGrid criativos={report.creatives} />
          </CardContent>
        </Card>
      ) : null}

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
