/**
 * Contrato único de dados do dashboard.
 *
 * Todo conector (Meta Ads, Google Ads, GA4, Orgânico) devolve um
 * `ChannelReport`. A UI só conhece este formato — trocar a origem de um canal
 * não toca em nenhum componente.
 */

/**
 * `vendas` está aqui, mas **fora de `CHANNELS`** (ver `lib/channels.ts`).
 *
 * Ela é um relatório como os outros — tem período, série e indicadores, e usa
 * a mesma tela. Não é canal de aquisição: não tem investimento, e somar
 * receita ao total de mídia na visão geral produziria um número sem
 * significado.
 */
export const CHANNEL_IDS = ["meta-ads", "google-ads", "ga4", "organico", "vendas"] as const;
export type ChannelId = (typeof CHANNEL_IDS)[number];

/**
 * De onde veio o número.
 *
 * `live` acompanha o filtro de datas; `mock` é número inventado, para quando
 * falta credencial.
 *
 * Houve uma terceira, `snapshot`: dado real exportado da plataforma e congelado
 * num período fixo, que serviu o Google Ads enquanto o token da API aguardava
 * aprovação. Saiu quando a API foi liberada — origem que nenhum canal produz é
 * peso morto que todo código de consolidação ainda precisa considerar.
 */
export type DataSource = "live" | "mock";

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
  /**
   * Não compare este número com o período anterior.
   *
   * Para métrica derivada — ticket médio, ciclo, taxa —, zero não quer dizer
   * "caiu para zero", quer dizer "não houve o que medir". Comparar produz
   * "-100%" com seta, e num ciclo de fechamento a seta sai **verde**, como se
   * fechar nada fosse melhora.
   */
  semComparacao?: boolean;
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
  /** Atalho para fora do painel, no cabeçalho da tabela. */
  action?: { label: string; href: string };
}

/**
 * Uma etapa do funil comercial, já com o acumulado calculado.
 *
 * `value` é **quantos chegaram até aqui**, não quantos estão parados aqui. São
 * perguntas diferentes: um negócio em Negociação já passou por Qualificação, e
 * desenhar a ocupação como se fosse fluxo faria a etapa do meio parecer um
 * gargalo que não existe.
 */
export interface FunnelStage {
  label: string;
  /** Negócios que chegaram a esta etapa ou passaram dela. */
  value: number;
  /** Soma do valor dos negócios contados, quando o CRM tem esse campo. */
  amount?: number;
  /**
   * Etapa de desfecho, e não de passagem.
   *
   * O ganho encerra o funil e por isso não usa a rampa das demais: é outra
   * categoria de coisa, e a cor sozinha não diz isso — vem com ícone e rótulo.
   */
  outcome?: "ganho";
}

/**
 * O funil comercial em forma de figura.
 *
 * Vive ao lado da tabela, não no lugar dela: a figura mostra o estrangulamento
 * de relance, a tabela é a versão em texto que sobrevive a leitor de tela, a
 * impressão em preto e branco e ao "me manda esse número".
 */
export interface FunnelBlock {
  title: string;
  description?: string;
  stages: FunnelStage[];
  /**
   * O que a figura não consegue mostrar, dito antes de alguém tirar a conclusão
   * errada — por exemplo, que o CRM só guarda a etapa atual do negócio.
   */
  caveat?: string;
}

/**
 * Uma peça de conteúdo com a arte e alguns números — anúncio ou publicação.
 *
 * É modelo de tela, não de domínio: cada conector calcula as métricas que
 * fazem sentido para ele e as entrega já rotuladas e formatadas. Anúncio fala
 * em investimento e CPL, publicação fala em alcance e comentários; forçar os
 * dois no mesmo conjunto de campos deixaria metade vazia dos dois lados.
 */
export interface ContentCard {
  id: string;
  title: string;
  /** Campanha, no anúncio. Data da publicação, no orgânico. */
  subtitle?: string;
  /**
   * Caminho no próprio domínio. A arte nunca é linkada direto do CDN da Meta:
   * a URL de lá carrega token assinado na query, e a CSP do painel não abre
   * para host de terceiro.
   */
  imageUrl?: string;
  /** Endereço público da peça, quando existe. Abre em nova aba. */
  link?: string;
  /** Texto do botão que abre o link. "Ver no Instagram", "Ver anúncio". */
  linkLabel?: string;
  /** Proporção da arte, quando conhecida — evita cortar Reels em quadro largo. */
  aspectRatio?: number;
  /**
   * Todas as artes da peça, na ordem publicada, quando é carrossel.
   *
   * A Meta devolve o álbum como uma mídia só, e a `media_url` dela é a
   * primeira imagem — mostrar apenas isso esconde o resto do carrossel, que
   * costuma ser onde está o argumento. A primeira entrada é a mesma capa de
   * `imageUrl`, então a lista se lê sozinha, sem precisar juntar as duas.
   */
  galeria?: string[];
  metrics: Array<{ label: string; value: number; format: MetricFormat }>;
  /**
   * Retenção desta peça, quando é vídeo. Retenção agregada da conta não
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
 * Fotografia recente do comportamento no site, pelo Clarity.
 *
 * Mora aqui, e não no conector, porque `components/` não pode importar de
 * `server/` — é o contrato de arquitetura cravado na CI.
 */
/**
 * O que a tela de Comportamento recebe.
 *
 * Três estados, e não "resumo ou nada". A primeira versão devolvia `null` tanto
 * para "falta credencial" quanto para "a chamada falhou", e a tela imprimia
 * "Clarity não configurado" nos dois casos — com o token cadastrado e presente
 * no diagnóstico. Quem lia era mandado configurar o que já estava configurado.
 */
export type ClarityEstado =
  | { estado: "sem-credencial" }
  | { estado: "falhou"; motivo: string }
  | {
      estado: "ok";
      resumo: ClarityResumo;
      /** Quando estes números foram lidos da API. */
      atualizadoEm: string;
      /**
       * A leitura falhou e estes são os últimos números bons que havia.
       *
       * Dado de ontem rotulado como tal vale mais que uma tela de erro: quem
       * abre o painel quer ver o comportamento do site, e a cota estourada é
       * problema do painel, não da pergunta.
       */
      defasado?: true;
    };

export interface ClarityResumo {
  /** Fração média da página que as pessoas percorreram. Entre 0 e 1. */
  rolagemMedia: number;
  sessoes: number;
  cliquesMortos: number;
  cliquesDeRaiva: number;
  voltasRapidas: number;
  errosDeScript: number;
  /** Rolagem por página, para a régua visual. */
  porPagina: Array<{
    pagina: string;
    rolagem: number;
    sessoes: number;
    cliquesMortos: number;
    cliquesDeRaiva: number;
  }>;
  /** Dias efetivamente cobertos — a API limita, o pedido não manda. */
  dias: number;
  /** ID do projeto, para os atalhos. */
  projeto: string | null;
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
  tables: TableBlock[];
  /** O funil comercial em figura, quando o canal tem etapas ordenadas. */
  funnel?: FunnelBlock;
  /** Peças com a arte, quando a origem fornece: anúncios ou publicações. */
  creatives?: ContentCard[];
  /**
   * Como a seção de peças se chama e por que está nessa ordem. Quem monta os
   * cartões é quem sabe o critério — a tela não tem como adivinhar se "melhor"
   * significa custo por lead ou alcance.
   */
  creativesLabel?: { title: string; description: string };
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
