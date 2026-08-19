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
  /**
   * Quantas linhas aparecem antes do "Ver todas". Uma tabela de 34 palavras-chave
   * empurra o resto da tela para fora da rolagem e ninguém lê da décima em
   * diante — mas o dado continua a um clique. Padrão: `LINHAS_VISIVEIS_PADRAO`.
   */
  initialRows?: number;
}

/**
 * Um anúncio, com a arte. Numa reunião a primeira pergunta depois de "quanto
 * gastou" é "qual criativo puxou isso" — e a resposta é visual.
 */
export interface CreativeCard {
  /** ID do anúncio na Meta. É o que o proxy de imagem usa para achar a arte. */
  id: string;
  name: string;
  campaign?: string;
  /**
   * Caminho no próprio domínio. A arte nunca é linkada direto do CDN da Meta:
   * a URL de lá carrega token assinado na query, e a CSP do painel não abre
   * para host de terceiro.
   */
  imageUrl?: string;
  spend: number;
  impressions: number;
  ctr: number;
  cpm: number;
  leads: number;
  cpl: number;
  /**
   * Retenção deste anúncio, quando ele é vídeo. Retenção agregada da conta não
   * responde a pergunta que importa — qual vídeo segura a atenção — porque a
   * média junta o que prende com o que é pulado no primeiro segundo.
   */
  video?: {
    reproducoes: number;
    /** Fração de quem começou e chegou a cada marca. Entre 0 e 1. */
    p25: number;
    p50: number;
    p75: number;
    p100: number;
  };
}

/**
 * Para quem o aviso é.
 *
 * `cliente` é o que ajuda a ler o relatório — por que um canal está fora do
 * consolidado, por que o filtro de data não move um período fixo.
 *
 * `operacao` é encanamento: nome de variável de ambiente, instrução de token,
 * detalhe de erro da API. Isso nunca vai para a tela do cliente. Continua no
 * payload, porque é o que `/api/health` e `/api/diagnostico/*` leem.
 */
export interface Notice {
  text: string;
  audience: "cliente" | "operacao";
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
  /** Anúncios com a arte, quando a origem fornece. Só o Meta Ads preenche. */
  creatives?: CreativeCard[];
  /** Avisos não-fatais: credencial ausente, métrica indisponível, etc. */
  notices: Notice[];
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
  notices: Notice[];
}
