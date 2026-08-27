import { avisoOperacao } from "@/lib/avisos";
import "server-only";

import { eachDay } from "@/lib/date-range";
import type { ChannelReport, DateRange, SeriesPoint } from "@/lib/types";
import { mockGoogleAds } from "@/mocks/reports";
import { getCredentials, getEnv, isForceMock } from "@/server/env";
import { getGoogleAccessToken } from "@/server/lib/google-auth";
import { descreverFalha, HttpError, httpJson } from "@/server/lib/http";
import { buildGoogleAdsSnapshotReport } from "./google-ads-snapshot";

/**
 * Google Ads via REST (`searchStream` do GAQL).
 * Docs: https://developers.google.com/google-ads/api/rest/overview
 *
 * Sem o SDK oficial de propósito: ele carrega gRPC + protobuf e pesa mais que
 * todo o resto do bundle de servidor. A superfície que usamos é uma query.
 */

interface GoogleAdsRow {
  segments?: { date?: string };
  campaign?: { name?: string; advertisingChannelType?: string };
  metrics?: {
    costMicros?: string;
    impressions?: string;
    clicks?: string;
    conversions?: number;
  };
}

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

/**
 * O token de desenvolvedor nasce com acesso de teste e só lê contas de teste.
 * Enquanto o Google não aprova o acesso básico, toda consulta à conta real
 * volta com este erro. É um estado esperado e temporário — não uma falha de
 * configuração — então a tela cai em demonstração com aviso, em vez de quebrar.
 */
function ehTokenAguardandoAprovacao(erro: unknown): boolean {
  const texto = erro instanceof Error ? erro.message + (erro as HttpError).body : "";
  return /DEVELOPER_TOKEN_NOT_APPROVED|DEVELOPER_TOKEN_PROHIBITED/i.test(texto);
}

export async function fetchGoogleAdsReport(range: DateRange): Promise<ChannelReport> {
  const forceMock = isForceMock();

  // Sem credencial, o canal cai no snapshot exportado da plataforma: dado real
  // da conta, preferível a número inventado. `QYRA_FORCE_MOCK` continua
  // devolvendo a fixture, que é o que os testes e o ambiente de preview usam.
  if (forceMock) {
    const report = mockGoogleAds(range, new Date().toISOString());
    report.notices = [avisoOperacao("Modo mock forçado por QYRA_FORCE_MOCK.")];
    return report;
  }

  if (!getCredentials().googleAds) {
    return buildGoogleAdsSnapshotReport(range);
  }

  const where = `segments.date BETWEEN '${range.from}' AND '${range.to}'`;

  let daily: GoogleAdsRow[];
  let byCampaign: GoogleAdsRow[];

  try {
    [daily, byCampaign] = await Promise.all([
      runQuery(
        `SELECT segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions
       FROM customer WHERE ${where}`,
      ),
      runQuery(
        `SELECT campaign.name, campaign.advertising_channel_type, metrics.cost_micros,
              metrics.impressions, metrics.clicks, metrics.conversions
       FROM campaign WHERE ${where}`,
      ),
    ]);
  } catch (erro) {
    // Este canal tem o export da plataforma como piso: dado real da conta, já
    // conferido. Derrubar a tela por erro de API seria trocar dado bom por
    // nenhum dado — e é numa reunião que a tela costuma ser aberta.
    const report = buildGoogleAdsSnapshotReport(range);
    report.notices = [
      // Operação: instrução de token e detalhe de erro não são assunto de quem
      // lê o relatório. O que interessa ao cliente — que os números vêm do
      // export, e de que período — já está no aviso do próprio snapshot.
      avisoOperacao(
        ehTokenAguardandoAprovacao(erro)
          ? "O token de desenvolvedor do Google Ads ainda está com acesso de teste, que não lê contas de produção. Solicite o acesso básico na Central de API da conta gerente — o token não muda, só o nível de acesso."
          : `A API do Google Ads não respondeu, então os números abaixo vêm do export da plataforma. Detalhe técnico: ${descreverFalha(erro)}`,
      ),
      ...report.notices,
    ];
    return report;
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

  // A API devolve uma linha por campanha por dia; agrega antes de listar.
  const campaigns = new Map<
    string,
    { name: string; type: string; cost: number; conversions: number }
  >();
  for (const row of byCampaign) {
    const name = row.campaign?.name ?? "—";
    const entry = campaigns.get(name) ?? {
      name,
      type: row.campaign?.advertisingChannelType ?? "—",
      cost: 0,
      conversions: 0,
    };
    entry.cost += num(row.metrics?.costMicros) / MICROS;
    entry.conversions += num(row.metrics?.conversions);
    campaigns.set(name, entry);
  }

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
        description: "Ordenadas por investimento no período.",
        columns: [
          { key: "name", label: "Campanha", align: "left" },
          { key: "type", label: "Tipo", align: "left" },
          { key: "cost", label: "Investimento", format: "currency", align: "right" },
          { key: "conversions", label: "Conversões", format: "integer", align: "right" },
          { key: "cpa", label: "CPA", format: "currency", align: "right" },
        ],
        rows: [...campaigns.values()]
          .map((c) => ({ ...c, cpa: c.conversions === 0 ? 0 : c.cost / c.conversions }))
          .sort((a, b) => b.cost - a.cost)
          .slice(0, 25),
      },
    ],
    notices: [],
  };
}
