"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatAxis, formatMetric, unitLabel } from "@/lib/format";
import type { MetricFormat } from "@/lib/types";
import { type SeriesSlot, seriesColor } from "./palette";

export interface ChannelBarDatum {
  label: string;
  value: number;
  /** Slot fixo do canal — a cor pertence ao canal, não à posição na barra. */
  slot: SeriesSlot;
}

/**
 * Comparativo entre canais.
 *
 * Uma série, uma cor por entidade. Barras finas, cantos arredondados só na
 * ponta do dado e ancoradas na linha de base; sem contorno separando barras —
 * o espaçamento faz esse trabalho.
 */
export function ChannelBars({
  data,
  format,
  height = 240,
}: {
  data: ChannelBarDatum[];
  format: MetricFormat;
  height?: number;
}) {
  const unit = unitLabel(format);

  return (
    <figure className="space-y-3">
      <figcaption className="sr-only">Comparativo por canal</figcaption>
      {unit ? <p className="text-xs text-ink-muted">Valores em {unit}</p> : null}
      <div style={{ height }} className="qy-fade">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
            barCategoryGap="34%"
          >
            <CartesianGrid stroke="var(--qy-grid)" strokeWidth={1} vertical={false} />
            <XAxis
              dataKey="label"
              stroke="var(--qy-axis)"
              tick={{ fill: "var(--qy-ink-muted)", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "var(--qy-axis)" }}
            />
            <YAxis
              tickFormatter={(value: number) => formatAxis(value, format)}
              stroke="var(--qy-axis)"
              tick={{ fill: "var(--qy-ink-muted)", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={48}
            />
            <Tooltip
              cursor={{ fill: "var(--qy-surface-sunken)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const datum = payload[0].payload as ChannelBarDatum;
                return (
                  <div className="rounded-xl border border-line bg-surface-raised px-3 py-2 shadow-lg">
                    <p className="text-xs font-medium text-ink">{datum.label}</p>
                    <p className="mt-0.5 text-xs tabular text-ink-secondary">
                      {formatMetric(datum.value, format)}
                    </p>
                  </div>
                );
              }}
            />
            <Bar
              dataKey="value"
              radius={[4, 4, 0, 0]}
              maxBarSize={56}
              isAnimationActive
              animationDuration={420}
            >
              {data.map((datum) => (
                <Cell key={datum.label} fill={seriesColor(datum.slot)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
