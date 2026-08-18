"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatDayShort } from "@/lib/date-range";
import { formatAxis, unitLabel } from "@/lib/format";
import type { SeriesDef, SeriesPoint } from "@/lib/types";
import { ChartLegend, ChartTooltip } from "./chart-tooltip";
import { seriesColor } from "./palette";

/**
 * Série temporal.
 *
 * Uma escala só, sempre. Duas métricas de grandezas diferentes (investimento e
 * conversões) nunca dividem o mesmo eixo: `TrendChart` plota uma métrica, e a
 * comparação acontece em pequenos múltiplos — dois gráficos lado a lado, mesmo
 * eixo x. Eixo duplo inventa correlação que não existe no dado.
 */
export function TrendChart({
  data,
  def,
  height = 260,
}: {
  data: SeriesPoint[];
  def: SeriesDef;
  height?: number;
}) {
  const gradientId = `qy-fill-${def.key}`;
  const color = seriesColor(def.slot);

  return (
    <figure className="space-y-3">
      <figcaption className="sr-only">{def.label} por dia</figcaption>
      <div style={{ height }} className="qy-fade">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.18} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>

            {/* Grade recessiva: hairline sólida, um tom acima da superfície. */}
            <CartesianGrid stroke="var(--qy-grid)" strokeWidth={1} vertical={false} />

            <XAxis
              dataKey="date"
              tickFormatter={formatDayShort}
              stroke="var(--qy-axis)"
              tick={{ fill: "var(--qy-ink-muted)", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "var(--qy-axis)" }}
              minTickGap={28}
            />
            <YAxis
              tickFormatter={(value: number) => formatAxis(value, def.format)}
              stroke="var(--qy-axis)"
              tick={{ fill: "var(--qy-ink-muted)", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={48}
            />
            <Tooltip
              cursor={{ stroke: "var(--qy-line-strong)", strokeWidth: 1 }}
              content={<ChartTooltip defs={[def]} />}
            />

            <Area
              type="monotone"
              dataKey={def.key}
              name={def.label}
              stroke={color}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--qy-chart-surface)" }}
              dot={false}
              isAnimationActive
              animationDuration={420}
              animationEasing="ease-out"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

/**
 * Pequenos múltiplos: uma métrica por painel, escalas independentes, mesmo
 * eixo x. É a alternativa correta ao eixo duplo.
 */
export function TrendSmallMultiples({
  data,
  defs,
  height = 200,
}: {
  data: SeriesPoint[];
  defs: SeriesDef[];
  height?: number;
}) {
  return (
    <div className="space-y-4">
      <ChartLegend defs={defs} />
      <div className="grid gap-6 md:grid-cols-2">
        {defs.map((def) => (
          <div key={def.key} className="space-y-2">
            <p className="text-xs font-medium text-ink-secondary">
              {def.label}
              {unitLabel(def.format) ? (
                <span className="ml-1 text-ink-muted">({unitLabel(def.format)})</span>
              ) : null}
            </p>
            <TrendChart data={data} def={def} height={height} />
          </div>
        ))}
      </div>
    </div>
  );
}
