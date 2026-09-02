import { avisoCliente, avisoOperacao } from "@/lib/avisos";
import "server-only";

import { eachDay } from "@/lib/date-range";
import type { ChannelReport, DateRange, SeriesPoint } from "@/lib/types";
import { mockGoogleAds } from "@/mocks/reports";
import { getCredentials, getEnv, isForceMock } from "@/server/env";
import { getGoogleAccessToken } from "@/server/lib/google-auth";
import { HttpError, httpJson } from "@/server/lib/http";

/**
 * Google Ads via REST (`searchStream` do GAQL).
 * Docs: https://developers.google.com/google-ads/api/rest/overview
 *
 * Sem o SDK oficial de propósito: ele carrega gRPC + protobuf e pesa mais que
 * todo o resto do bundle de servidor. A superfície que usamos é uma query.
 */

interface GoogleAdsRow {
  segments?: {
    date?: string;
    device?: string;
    dayOfWeek?: string;
    /** Nome de recurso, tipo `geoTargetConstants/1031297` — não o nome legível. */
    geoTargetCity?: string;
  };
  campaign?: { name?: string; advertisingChannelType?: string; status?: string };
  campaignBudget?: { amountMicros?: string };
  adGroup?: { name?: string };
  searchTermView?: { searchTerm?: string };
  adGroupCriterion?: { keyword?: { text?: string; matchType?: string } };
  geoTargetConstant?: { resourceName?: string; canonicalName?: string };
  metrics?: {
    costMicros?: string;
    impressions?: string;
    clicks?: string;
    conversions?: number;
  };
}

/** O que toda tabela deste canal soma. */
interface Metricas {
  custo: number;
  cliques: number;
  impressoes: number;
  conversoes: number;
}

function zerado(): Metricas {
  return { custo: 0, cliques: 0, impressoes: 0, conversoes: 0 };
}

/**
 * Agrega as linhas por uma chave.
 *
 * A API devolve uma linha por dia por dimensão — pedir 28 dias de cinco grupos
 * de anúncios traz 140 linhas. Toda tabela aqui precisa da mesma soma, e
 * repetir o laço em cada uma foi o caminho mais curto para uma delas divergir.
 */
function agregar(linhas: GoogleAdsRow[], chave: (linha: GoogleAdsRow) => string | null) {
  const mapa = new Map<string, Metricas>();
  for (const linha of linhas) {
    const k = chave(linha);
    if (k === null) continue;
    const acc = mapa.get(k) ?? zerado();
    acc.custo += num(linha.metrics?.costMicros) / MICROS;
    acc.cliques += num(linha.metrics?.clicks);
    acc.impressoes += num(linha.metrics?.impressions);
    acc.conversoes += num(linha.metrics?.conversions);
    mapa.set(k, acc);
  }
  return mapa;
}

/** CTR, CPC e CPA a partir dos totais — nunca a média das médias da API. */
function derivadas(m: Metricas) {
  return {
    custo: Math.round(m.custo * 100) / 100,
    cliques: m.cliques,
    impressoes: m.impressoes,
    conversoes: m.conversoes,
    ctr: m.impressoes === 0 ? 0 : m.cliques / m.impressoes,
    cpc: m.cliques === 0 ? 0 : m.custo / m.cliques,
    cpa: m.conversoes === 0 ? 0 : m.custo / m.conversoes,
  };
}

/** Ordena por investimento e corta, devolvendo quantas linhas ficaram de fora. */
function maiores<T extends { custo: number }>(linhas: T[], teto: number) {
  const ordenadas = [...linhas].sort((a, b) => b.custo - a.custo);
  return { visiveis: ordenadas.slice(0, teto), restantes: Math.max(0, ordenadas.length - teto) };
}

const DIAS = {
  MONDAY: "Segunda-feira",
  TUESDAY: "Terça-feira",
  WEDNESDAY: "Quarta-feira",
  THURSDAY: "Quinta-feira",
  FRIDAY: "Sexta-feira",
  SATURDAY: "Sábado",
  SUNDAY: "Domingo",
} as const;

/** Ordem de semana, não ordem de volume: o dia da semana é uma sequência. */
const ORDEM_DOS_DIAS = Object.values(DIAS);

const DISPOSITIVOS: Record<string, string> = {
  MOBILE: "Smartphones",
  DESKTOP: "Computadores",
  TABLET: "Tablets",
  CONNECTED_TV: "TV conectada",
  OTHER: "Outros",
};

/** Colunas repetidas por quase toda tabela deste canal. */
const COLUNAS_DE_METRICA = [
  { key: "impressoes", label: "Impressões", format: "integer" as const, align: "right" as const },
  { key: "cliques", label: "Cliques", format: "integer" as const, align: "right" as const },
  { key: "ctr", label: "CTR", format: "percent" as const, align: "right" as const },
  { key: "custo", label: "Investimento", format: "currency" as const, align: "right" as const },
  { key: "cpc", label: "CPC", format: "currency" as const, align: "right" as const },
  { key: "conversoes", label: "Conversões", format: "integer" as const, align: "right" as const },
];

/** `searchStream` responde um array de blocos, cada um com `results`. */
type SearchStreamResponse = Array<{ results?: GoogleAdsRow[] }>;

const MICROS = 1_000_000;

function num(value: string | number | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Versões candidatas da API, da mais nova para a mais antiga.
 *
 * O Google publica cerca de três por ano e aposenta cada uma depois de ~13
 * meses. Versão aposentada não devolve erro de API: a URL deixa de existir e a
 * resposta é uma página HTML de 404. Foi assim que o painel ficou meses
 * apontando para a `v18` sem ninguém perceber — o erro parecia problema de
 * token.
 */
export const VERSOES_CANDIDATAS = ["v22", "v21", "v20", "v19"];

/** Memoriza a versão que respondeu, para não sondar a cada requisição. */
let versaoEmUso: string | null = null;

/**
 * URL inexistente, não erro da API. A Graph do Google devolve 404 com corpo
 * HTML quando a versão foi aposentada; erro de permissão ou de token vem como
 * JSON, com outro status.
 */
function ehVersaoInexistente(erro: unknown): boolean {
  return erro instanceof HttpError && erro.status === 404;
}

/**
 * Versões a tentar. Com `GOOGLE_ADS_API_VERSION` preenchido, obedece e não
 * sonda — é assim que se fixa uma versão depois de descobrir qual funciona.
 */
function versoesParaTentar(): string[] {
  const fixada = getEnv().GOOGLE_ADS_API_VERSION;
  if (fixada) return [fixada];
  if (versaoEmUso) return [versaoEmUso, ...VERSOES_CANDIDATAS.filter((v) => v !== versaoEmUso)];
  return VERSOES_CANDIDATAS;
}

/** Versão que respondeu na última consulta bem-sucedida, para o diagnóstico. */
export function versaoDaApiEmUso(): string | null {
  return getEnv().GOOGLE_ADS_API_VERSION ?? versaoEmUso;
}

async function runQuery(query: string): Promise<GoogleAdsRow[]> {
  const env = getEnv();
  const token = await getGoogleAccessToken();
  const customerId = (env.GOOGLE_ADS_CUSTOMER_ID as string).replace(/-/g, "");

  const headers: Record<string, string> = {
    authorization: `Bearer ${token}`,
    "developer-token": env.GOOGLE_ADS_DEVELOPER_TOKEN as string,
    "content-type": "application/json",
  };
  if (env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) {
    headers["login-customer-id"] = env.GOOGLE_ADS_LOGIN_CUSTOMER_ID.replace(/-/g, "");
  }

  const versoes = versoesParaTentar();
  let ultimoErro: unknown;

  for (const versao of versoes) {
    try {
      const response = await httpJson<SearchStreamResponse>(
        `https://googleads.googleapis.com/${versao}/customers/${customerId}/googleAds:searchStream`,
        { method: "POST", headers, body: JSON.stringify({ query }) },
      );
      versaoEmUso = versao;
      return response.flatMap((chunk) => chunk.results ?? []);
    } catch (erro) {
      ultimoErro = erro;
      // Só 404 significa "esta versão não existe mais". Token recusado,
      // permissão negada ou conta errada precisam propagar na hora — insistir
      // em outra versão só transformaria um erro claro em confusão.
      if (!ehVersaoInexistente(erro)) throw erro;
    }
  }

  throw ultimoErro;
}

export async function fetchGoogleAdsReport(range: DateRange): Promise<ChannelReport> {
  const forceMock = isForceMock();

  // Mesmo caminho dos demais canais. Houve um desvio aqui — sem credencial, o
  // Google Ads caía num export em CSV da plataforma, dado real congelado num
  // período fixo, enquanto o token da API aguardava aprovação. O token saiu, e
  // com ele a razão de o canal ser exceção.
  if (forceMock || !getCredentials().googleAds) {
    const report = mockGoogleAds(range, new Date().toISOString());
    report.notices = [
      avisoOperacao(
        forceMock
          ? "Modo mock forçado por QYRA_FORCE_MOCK."
          : "Sem credencial do Google Ads — exibindo dados de demonstração.",
      ),
    ];
    return report;
  }

  const where = `segments.date BETWEEN '${range.from}' AND '${range.to}'`;

  // Falha da API sobe, como em todo canal: `getAllReports` registra o erro, a
  // visão geral segue sem este canal e a tela dele mostra o que aconteceu.
  // Engolir o erro para servir outra coisa foi o que produziu meses de número
  // congelado passando por atual.
  const METRICAS = "metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions";

  const [daily, byCampaign, porGrupo, porTermo, porPalavra, porDispositivo, porDia, porLocal] =
    await Promise.all([
      runQuery(`SELECT segments.date, ${METRICAS} FROM customer WHERE ${where}`),
      runQuery(
        `SELECT campaign.name, campaign.advertising_channel_type, campaign.status,
              campaign_budget.amount_micros, ${METRICAS}
       FROM campaign WHERE ${where}`,
      ),
      runQuery(`SELECT ad_group.name, campaign.name, ${METRICAS} FROM ad_group WHERE ${where}`),
      runQuery(
        `SELECT search_term_view.search_term, ad_group.name, ${METRICAS}
       FROM search_term_view WHERE ${where}`,
      ),
      runQuery(
        `SELECT ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
              ad_group.name, ${METRICAS}
       FROM keyword_view WHERE ${where}`,
      ),
      runQuery(`SELECT segments.device, ${METRICAS} FROM campaign WHERE ${where}`),
      runQuery(`SELECT segments.day_of_week, ${METRICAS} FROM customer WHERE ${where}`),
      // `LOCATION_OF_PRESENCE` e não também `AREA_OF_INTEREST`: sem o filtro, a
      // mesma sessão aparece duas vezes — onde a pessoa estava e sobre onde ela
      // pesquisou — e o total de cliques dos locais passa o da conta.
      runQuery(
        `SELECT segments.geo_target_city, ${METRICAS}
       FROM geographic_view
       WHERE ${where} AND geographic_view.location_type = 'LOCATION_OF_PRESENCE'`,
      ),
    ]);

  // Os nomes das localidades vêm de outro recurso: `geographic_view` devolve
  // `geoTargetConstants/1031297`, não "São Paulo". Uma consulta a mais resolve
  // todos de uma vez; sem ela a tabela listaria identificadores.
  const idsDeLocal = [
    ...new Set(porLocal.map((l) => l.segments?.geoTargetCity).filter(Boolean)),
  ] as string[];
  const nomesDeLocal = new Map<string, string>();
  if (idsDeLocal.length > 0) {
    const lista = idsDeLocal.map((id) => `'${id}'`).join(", ");
    for (const linha of await runQuery(
      `SELECT geo_target_constant.resource_name, geo_target_constant.canonical_name
       FROM geo_target_constant WHERE geo_target_constant.resource_name IN (${lista})`,
    )) {
      const recurso = linha.geoTargetConstant?.resourceName;
      const nome = linha.geoTargetConstant?.canonicalName;
      if (recurso && nome) nomesDeLocal.set(recurso, nome);
    }
  }

  const byDate = new Map<
    string,
    { cost: number; impressions: number; clicks: number; conversions: number }
  >();
  for (const row of daily) {
    const date = row.segments?.date;
    if (!date) continue;
    const acc = byDate.get(date) ?? { cost: 0, impressions: 0, clicks: 0, conversions: 0 };
    acc.cost += num(row.metrics?.costMicros) / MICROS;
    acc.impressions += num(row.metrics?.impressions);
    acc.clicks += num(row.metrics?.clicks);
    acc.conversions += num(row.metrics?.conversions);
    byDate.set(date, acc);
  }

  const series: SeriesPoint[] = eachDay(range).map((date) => {
    const row = byDate.get(date) ?? { cost: 0, impressions: 0, clicks: 0, conversions: 0 };
    return {
      date,
      cost: row.cost,
      impressions: row.impressions,
      clicks: row.clicks,
      conversions: row.conversions,
      cpc: row.clicks === 0 ? 0 : row.cost / row.clicks,
    };
  });

  const totals = series.reduce(
    (acc, p) => ({
      cost: acc.cost + Number(p.cost),
      impressions: acc.impressions + Number(p.impressions),
      clicks: acc.clicks + Number(p.clicks),
      conversions: acc.conversions + Number(p.conversions),
    }),
    { cost: 0, impressions: 0, clicks: 0, conversions: 0 },
  );

  // A API devolve uma linha por dia por dimensão; tudo é agregado antes de virar
  // tabela. Os atributos que não são métrica — tipo, status, orçamento — são os
  // mesmos em todas as linhas da campanha, então basta guardar a primeira.
  const atributosDaCampanha = new Map<
    string,
    { tipo: string; status: string; orcamento: number }
  >();
  for (const linha of byCampaign) {
    const nome = linha.campaign?.name;
    if (!nome || atributosDaCampanha.has(nome)) continue;
    atributosDaCampanha.set(nome, {
      tipo: linha.campaign?.advertisingChannelType ?? "—",
      status: linha.campaign?.status ?? "—",
      orcamento: num(linha.campaignBudget?.amountMicros) / MICROS,
    });
  }

  const campanhas = [...agregar(byCampaign, (l) => l.campaign?.name ?? null)].map(([nome, m]) => ({
    nome,
    ...atributosDaCampanha.get(nome),
    ...derivadas(m),
  }));

  const grupos = [...agregar(porGrupo, (l) => l.adGroup?.name ?? null)].map(([grupo, m]) => ({
    grupo,
    ...derivadas(m),
  }));

  const termos = maiores(
    [...agregar(porTermo, (l) => l.searchTermView?.searchTerm ?? null)].map(([termo, m]) => ({
      termo,
      ...derivadas(m),
    })),
    30,
  );

  const palavras = maiores(
    [
      ...agregar(porPalavra, (l) => {
        const texto = l.adGroupCriterion?.keyword?.text;
        return texto ? `${texto}\u0000${l.adGroupCriterion?.keyword?.matchType ?? "—"}` : null;
      }),
    ].map(([chave, m]) => {
      const [palavra, correspondencia] = chave.split("\u0000");
      return { palavra, correspondencia, ...derivadas(m) };
    }),
    30,
  );

  const dispositivos = [...agregar(porDispositivo, (l) => l.segments?.device ?? null)]
    .map(([codigo, m]) => ({ dispositivo: DISPOSITIVOS[codigo] ?? codigo, ...derivadas(m) }))
    .sort((a, b) => b.custo - a.custo);

  const investimentoTotal = dispositivos.reduce((a, d) => a + d.custo, 0);
  const dispositivosComFatia = dispositivos.map((d) => ({
    ...d,
    fatia: investimentoTotal === 0 ? 0 : d.custo / investimentoTotal,
  }));

  const porSemana = agregar(porDia, (l) => l.segments?.dayOfWeek ?? null);
  // Ordem de semana, não de volume: dia da semana é sequência, e ordenar por
  // investimento tiraria a única leitura que essa tabela oferece.
  const diasDaSemana = ORDEM_DOS_DIAS.map((nome) => {
    const codigo = Object.entries(DIAS).find(([, v]) => v === nome)?.[0] as string;
    return { dia: nome, ...derivadas(porSemana.get(codigo) ?? zerado()) };
  }).filter((d) => d.impressoes > 0);

  const locais = maiores(
    [...agregar(porLocal, (l) => l.segments?.geoTargetCity ?? null)].map(([id, m]) => ({
      local: nomesDeLocal.get(id) ?? id,
      ...derivadas(m),
    })),
    25,
  );

  return {
    channel: "google-ads",
    label: "Google Ads",
    source: "live",
    range,
    fetchedAt: new Date().toISOString(),
    kpis: [
      { key: "cost", label: "Investimento", value: totals.cost, format: "currency" },
      { key: "conversions", label: "Conversões", value: totals.conversions, format: "integer" },
      {
        key: "cpa",
        label: "Custo por conversão",
        value: totals.conversions === 0 ? 0 : totals.cost / totals.conversions,
        format: "currency",
        lowerIsBetter: true,
      },
      {
        key: "cpc",
        label: "CPC médio",
        value: totals.clicks === 0 ? 0 : totals.cost / totals.clicks,
        format: "currency",
        lowerIsBetter: true,
      },
      {
        key: "ctr",
        label: "CTR",
        value: totals.impressions === 0 ? 0 : totals.clicks / totals.impressions,
        format: "percent",
      },
    ],
    series,
    seriesDefs: [
      { key: "cost", label: "Investimento", format: "currency", slot: 1 },
      { key: "conversions", label: "Conversões", format: "integer", slot: 2 },
    ],
    tables: [
      {
        title: "Campanhas",
        description: "Ordenadas por investimento no período, com o orçamento diário de cada uma.",
        columns: [
          { key: "nome", label: "Campanha", align: "left" },
          { key: "tipo", label: "Tipo", align: "left" },
          { key: "status", label: "Status", align: "left" },
          { key: "orcamento", label: "Orçamento/dia", format: "currency", align: "right" },
          ...COLUNAS_DE_METRICA,
          { key: "cpa", label: "CPA", format: "currency", align: "right" },
        ],
        rows: maiores(campanhas, 25).visiveis,
      },
      {
        title: "Grupos de anúncios",
        description: "Ordenados por investimento. É aqui que se vê onde o orçamento realmente foi.",
        columns: [{ key: "grupo", label: "Grupo", align: "left" }, ...COLUNAS_DE_METRICA],
        rows: maiores(grupos, 25).visiveis,
      },
      {
        title: "Termos de pesquisa",
        description: `O que as pessoas realmente digitaram${
          termos.restantes > 0
            ? `. Os ${termos.visiveis.length} de maior investimento, de ${termos.visiveis.length + termos.restantes} termos no período.`
            : " no período."
        }`,
        columns: [{ key: "termo", label: "Termo", align: "left" }, ...COLUNAS_DE_METRICA],
        rows: termos.visiveis,
      },
      {
        title: "Palavras-chave",
        description: `Ordenadas por investimento${
          palavras.restantes > 0
            ? `. As ${palavras.visiveis.length} maiores, de ${palavras.visiveis.length + palavras.restantes} no período.`
            : "."
        }`,
        columns: [
          { key: "palavra", label: "Palavra-chave", align: "left" },
          { key: "correspondencia", label: "Correspondência", align: "left" },
          ...COLUNAS_DE_METRICA,
        ],
        rows: palavras.visiveis,
      },
      {
        title: "Dispositivos",
        description: "Participação de cada dispositivo no investimento.",
        columns: [
          { key: "dispositivo", label: "Dispositivo", align: "left" },
          ...COLUNAS_DE_METRICA,
          { key: "fatia", label: "% do investimento", format: "percent", align: "right" },
        ],
        rows: dispositivosComFatia,
      },
      {
        title: "Desempenho por dia da semana",
        description: "Na ordem da semana, não por volume — a leitura aqui é a sequência.",
        columns: [{ key: "dia", label: "Dia", align: "left" }, ...COLUNAS_DE_METRICA],
        rows: diasDaSemana,
      },
      {
        title: "Locais",
        description: `De onde vieram os cliques${
          locais.restantes > 0
            ? `. Os ${locais.visiveis.length} de maior investimento, de ${locais.visiveis.length + locais.restantes} localidades alcançadas.`
            : "."
        }`,
        columns: [{ key: "local", label: "Local", align: "left" }, ...COLUNAS_DE_METRICA],
        rows: locais.visiveis,
      },
    ],
    // Informações de leilão não entram: o Google não expõe esse relatório na
    // API, nem por GAQL nem por recurso próprio — é dado exclusivo da
    // interface. Fingir que existe seria inventar; omitir sem dizer deixaria
    // quem procura achando que o painel esqueceu.
    notices: [
      avisoCliente(
        "O relatório de informações do leilão — quem mais aparece nas mesmas buscas — não está no painel porque o Google não o disponibiliza por API. Ele existe apenas na interface do Google Ads, em Insights → Relatórios → Informações do leilão.",
      ),
    ],
  };
}
