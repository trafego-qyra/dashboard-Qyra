/**
 * Contrato único de dados do dashboard.
 *
 * Todo conector (Meta Ads, Google Ads, GA4, Orgânico) devolve um
 * `ChannelReport`. A UI só conhece este formato — trocar a origem de um canal
 * não toca em nenhum componente.
 */

export const CHANNEL_IDS = ["meta-ads", "google-ads", "ga4", "organico"] as const;
export type ChannelId = (typeof CHANNEL_IDS)[number];

/**
 * De onde veio o número.
 *
 * `snapshot` é dado REAL exportado da plataforma, congelado num período fixo —
 * usado quando a API ainda não está liberada. Precisa ser distinto de `mock`
 * (número inventado) e de `live` (período acompanha o filtro), porque as três
 * situações pedem leituras diferentes de quem olha a tela.
 */
export type DataSource = "live" | "mock" | "snapshot";

/** Como um número deve ser renderizado. A UI nunca decide formato sozinha. */
export type MetricFormat = "currency" | "integer" | "decimal" | "percent" | "ratio" | "duration";

export interface DateRange {
  /** ISO `YYYY-MM-DD`, inclusivo. */
  from: string;
  /** ISO `YYYY-MM-DD`, inclusivo. */
  to: string;
}

export interface Kpi {
  key: string;
  label: string;
  value: number;
  /** Mesmo intervalo, deslocado para trás. Ausente = sem comparação. */
  previousValue?: number;
  format: MetricFormat;
  /** `true` quando cair é bom (CPA, CPC, CPL). Inverte a leitura do delta. */
  lowerIsBetter?: boolean;
  hint?: string;
}

/** Um ponto diário da série. `date` é ISO; o resto são métricas numéricas. */
export interface SeriesPoint {
  /** Rótulo do ponto: data ISO, ou hora do dia quando `seriesAxis` é `hour`. */
  date: string;
  [metric: string]: string | number;
}

export interface SeriesDef {
  key: string;
  label: string;
  format: MetricFormat;
  /** Slot fixo da paleta categórica (1-5). Cor segue a entidade, não o rank. */
  slot: 1 | 2 | 3 | 4 | 5;
}

interface TableColumn {
  key: string;
  label: string;
  format?: MetricFormat;
  align?: "left" | "right";
}

export interface TableBlock {
  title: string;
  description?: string;
  columns: TableColumn[];
  rows: Array<Record<string, string | number>>;
}

export interface ChannelReport {
  channel: ChannelId;
  label: string;
  source: DataSource;
  range: DateRange;
  /** ISO datetime de quando os dados foram buscados. */
  fetchedAt: string;
  kpis: Kpi[];
  series: SeriesPoint[];
  seriesDefs: SeriesDef[];
  /**
   * O que o eixo x representa. `date` é o padrão; `hour` é usado quando a
   * origem só fornece agregado por hora do dia, sem quebra por data.
   */
  seriesAxis?: "date" | "hour";
  /** Período real dos dados, quando difere do intervalo pedido. */
  periodLabel?: string;
  tables: TableBlock[];
  /** Avisos não-fatais: credencial ausente, métrica indisponível, etc. */
  notices: string[];
}

export interface OverviewReport {
  range: DateRange;
  source: DataSource;
  fetchedAt: string;
  kpis: Kpi[];
  series: SeriesPoint[];
  seriesDefs: SeriesDef[];
  /** Investimento e resultado por canal, para o comparativo. */
  byChannel: Array<{
    channel: ChannelId;
    label: string;
    slot: 1 | 2 | 3 | 4 | 5;
    /** De onde veio este canal. Misturar `live` com `mock` num total é mentira. */
    source: DataSource;
    investment: number;
    conversions: number;
    sessions: number;
  }>;
  /** Canais que não responderam. Total parcial precisa ser declarado como tal. */
  failedChannels: ChannelId[];
  notices: string[];
}
