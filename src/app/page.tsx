import Link from "next/link";

import { ChannelBars, TrendSmallMultiples } from "@/components/charts/lazy";
import { DateRangePicker } from "@/components/layout/date-range-picker";
import { Notices } from "@/components/layout/notices";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { StatTile } from "@/components/ui/stat-tile";
import { CHANNELS } from "@/lib/channels";
import { parseRange } from "@/lib/date-range";
import { getOverviewReport } from "@/server/reports";

export const dynamic = "force-dynamic";

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; from?: string; to?: string }>;
}) {
  const { range, preset } = parseRange(await searchParams);
  const report = await getOverviewReport(range);
  const [primary, ...rest] = report.kpis;

  const hasInvestment = report.byChannel.some((c) => c.investment > 0);

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        title="Visão geral"
        description="Investimento, resultado e audiência somados de Meta Ads, Google Ads, Analytics e orgânico."
        source={report.source}
        actions={<DateRangePicker range={range} preset={preset} />}
      />

      <Notices notices={report.notices} />

      <section
        aria-label="Indicadores"
        className="grid grid-cols-2 gap-3 qy-stagger [&>*:last-child:nth-child(odd)]:col-span-2 sm:gap-4 lg:grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] lg:[&>*:last-child:nth-child(odd)]:col-span-1"
      >
        {primary ? <StatTile kpi={primary} emphasis /> : null}
        {rest.map((kpi) => (
          <StatTile key={kpi.key} kpi={kpi} />
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
        <Card className="qy-rise">
          <CardHeader>
            <div>
              <CardTitle>Evolução diária</CardTitle>
              <CardDescription>
                Investimento em mídia e conversões consolidadas, cada um na própria escala.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <TrendSmallMultiples data={report.series} defs={report.seriesDefs} height={190} />
          </CardContent>
        </Card>

        <Card className="qy-rise">
          <CardHeader>
            <div>
              <CardTitle>Investimento por canal</CardTitle>
              <CardDescription>Cada canal mantém sua cor em toda a aplicação.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {hasInvestment ? (
              <ChannelBars
                format="currency"
                data={report.byChannel
                  .filter((c) => c.investment > 0)
                  .map((c) => ({ label: c.label, value: c.investment, slot: c.slot }))}
                height={300}
              />
            ) : (
              <EmptyState
                title="Nenhum investimento no período"
                description="Os canais de mídia paga não registraram gasto neste intervalo. Confira se as campanhas estão ativas ou amplie o período."
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="qy-rise">
        <CardHeader>
          <div>
            <CardTitle>Resumo por canal</CardTitle>
            <CardDescription>
              Mesmos números dos gráficos, em texto — ordene por qualquer coluna.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="px-2">
          <DataTable
            block={{
              title: "Resumo por canal",
              columns: [
                { key: "label", label: "Canal", align: "left" },
                { key: "investment", label: "Investimento", format: "currency", align: "right" },
                { key: "conversions", label: "Resultados", format: "integer", align: "right" },
                { key: "sessions", label: "Alcance / sessões", format: "integer", align: "right" },
              ],
              rows: report.byChannel.map((c) => ({
                label: c.label,
                investment: c.investment,
                conversions: c.conversions,
                sessions: c.sessions,
              })),
            }}
          />
        </CardContent>
      </Card>

      <section aria-label="Atalhos" className="grid gap-3 qy-stagger sm:grid-cols-2 xl:grid-cols-4">
        {CHANNELS.map((channel) => (
          <Card
            key={channel.id}
            className="flex flex-col p-4 transition-transform duration-[var(--duration-base)] ease-[var(--ease-out-soft)] hover:-translate-y-0.5"
          >
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="mt-1 size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: `var(--color-series-${channel.slot})` }}
              />
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-semibold text-ink">{channel.label}</p>
                <p className="text-xs text-ink-muted">{channel.description}</p>
              </div>
            </div>
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="mt-auto w-full justify-start px-2 pt-3"
            >
              <Link href={channel.href}>Ver detalhes</Link>
            </Button>
          </Card>
        ))}
      </section>
    </div>
  );
}
