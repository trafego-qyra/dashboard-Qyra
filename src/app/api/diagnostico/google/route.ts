import { NextResponse } from "next/server";

import { rangeFromPreset } from "@/lib/date-range";
import { getCredentials, getEnv } from "@/server/env";
import { guard } from "@/server/lib/api";
import { redactSecrets } from "@/server/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Diagnóstico das integrações Google (Ads e GA4).
 *
 * Mesma ideia do diagnóstico da Meta: percorre a cadeia inteira — troca do
 * refresh token, acesso às contas, consulta mínima — e diz em qual degrau
 * quebra. Existe porque a cadeia do Google tem mais elos que a da Meta
 * (OAuth + developer token + conta gerente + propriedade), e cada elo falha
 * com uma mensagem diferente.
 */

interface Etapa {
  etapa: string;
  descricao: string;
  status: number | null;
  ok: boolean;
  resultado: string;
}

function mascarar(valor: string): string {
  if (valor.length <= 10) return valor;
  return `${valor.slice(0, 6)}…${valor.slice(-4)}`;
}

async function requisitar(
  etapa: string,
  descricao: string,
  entrada: { url: string; init?: RequestInit },
  resumir: (dados: unknown) => string,
): Promise<Etapa> {
  try {
    const resposta = await fetch(entrada.url, {
      ...entrada.init,
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });

    const texto = await resposta.text();

    if (!resposta.ok) {
      return {
        etapa,
        descricao,
        status: resposta.status,
        ok: false,
        resultado: redactSecrets(texto).slice(0, 500),
      };
    }

    return {
      etapa,
      descricao,
      status: resposta.status,
      ok: true,
      resultado: resumir(JSON.parse(texto)),
    };
  } catch (erro) {
    return {
      etapa,
      descricao,
      status: null,
      ok: false,
      resultado: redactSecrets(erro instanceof Error ? erro.message : String(erro)).slice(0, 300),
    };
  }
}

export async function GET(request: Request) {
  const { headers, blocked } = guard(request);
  if (blocked) return blocked;

  const env = getEnv();
  const etapas: Etapa[] = [];

  const temOAuth = Boolean(
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REFRESH_TOKEN,
  );

  if (!temOAuth) {
    return NextResponse.json(
      {
        conclusao:
          "OAuth do Google incompleto. As três variáveis são necessárias antes de qualquer teste.",
        faltando: {
          GOOGLE_CLIENT_ID: !env.GOOGLE_CLIENT_ID,
          GOOGLE_CLIENT_SECRET: !env.GOOGLE_CLIENT_SECRET,
          GOOGLE_REFRESH_TOKEN: !env.GOOGLE_REFRESH_TOKEN,
        },
      },
      { headers },
    );
  }

  // 1. O refresh token vira access token? Falha aqui invalida todo o resto.
  let accessToken: string | null = null;
  let escopos = "";

  const corpo = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID as string,
    client_secret: env.GOOGLE_CLIENT_SECRET as string,
    refresh_token: env.GOOGLE_REFRESH_TOKEN as string,
    grant_type: "refresh_token",
  });

  etapas.push(
    await requisitar(
      "oauth",
      "O refresh token é trocado por um access token?",
      {
        url: "https://oauth2.googleapis.com/token",
        init: {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: corpo.toString(),
        },
      },
      (d) => {
        const dados = d as { access_token?: string; expires_in?: number; scope?: string };
        accessToken = dados.access_token ?? null;
        escopos = dados.scope ?? "";
        return `Trocado. Validade ${dados.expires_in ?? "?"}s. Escopos concedidos: ${
          escopos || "(nenhum informado)"
        }.`;
      },
    ),
  );

  const temEscopoAds = escopos.includes("adwords");
  const temEscopoAnalytics = escopos.includes("analytics");

  if (accessToken) {
    const auth = { authorization: `Bearer ${accessToken}` };

    // 2. GA4 — a propriedade responde?
    if (env.GA4_PROPERTY_ID) {
      const range = rangeFromPreset("7d");
      etapas.push(
        await requisitar(
          "ga4",
          "A propriedade do GA4 responde a uma consulta mínima?",
          {
            url: `https://analyticsdata.googleapis.com/v1beta/properties/${env.GA4_PROPERTY_ID}:runReport`,
            init: {
              method: "POST",
              headers: { ...auth, "content-type": "application/json" },
              body: JSON.stringify({
                dateRanges: [{ startDate: range.from, endDate: range.to }],
                metrics: [{ name: "sessions" }],
              }),
            },
          },
          (d) => {
            const dados = d as { rows?: Array<{ metricValues?: Array<{ value?: string }> }> };
            const sessoes = dados.rows?.[0]?.metricValues?.[0]?.value;
            return sessoes === undefined
              ? "Consulta aceita, mas sem linhas — a propriedade não registrou sessão no período."
              : `${sessoes} sessão(ões) nos últimos 7 dias.`;
          },
        ),
      );
    } else {
      etapas.push({
        etapa: "ga4",
        descricao: "A propriedade do GA4 responde?",
        status: null,
        ok: false,
        resultado:
          "GA4_PROPERTY_ID não configurado. É o ID numérico da propriedade, não o G-XXXXXXX.",
      });
    }

    // 3. Google Ads — quais contas o token alcança?
    if (env.GOOGLE_ADS_DEVELOPER_TOKEN) {
      const cabecalhos: Record<string, string> = {
        ...auth,
        "developer-token": env.GOOGLE_ADS_DEVELOPER_TOKEN,
      };
      if (env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) {
        cabecalhos["login-customer-id"] = env.GOOGLE_ADS_LOGIN_CUSTOMER_ID.replace(/-/g, "");
      }

      etapas.push(
        await requisitar(
          "ads-acesso",
          "O developer token é aceito e quais contas ele alcança?",
          {
            url: `https://googleads.googleapis.com/${env.GOOGLE_ADS_API_VERSION}/customers:listAccessibleCustomers`,
            init: { headers: cabecalhos },
          },
          (d) => {
            const dados = d as { resourceNames?: string[] };
            const contas = (dados.resourceNames ?? []).map((r) => r.replace("customers/", ""));
            const alvo = env.GOOGLE_ADS_CUSTOMER_ID?.replace(/-/g, "");
            const encontrada = alvo ? contas.includes(alvo) : false;
            return `${contas.length} conta(s) acessível(is).${
              alvo
                ? encontrada
                  ? " A conta configurada está entre elas."
                  : ` A conta configurada (${mascarar(alvo)}) NÃO está entre elas — verifique GOOGLE_ADS_LOGIN_CUSTOMER_ID.`
                : " GOOGLE_ADS_CUSTOMER_ID não configurado."
            }`;
          },
        ),
      );

      // 4. Google Ads — a consulta real funciona?
      if (env.GOOGLE_ADS_CUSTOMER_ID) {
        const range = rangeFromPreset("7d");
        etapas.push(
          await requisitar(
            "ads-consulta",
            "A consulta GAQL do conector responde?",
            {
              url: `https://googleads.googleapis.com/${env.GOOGLE_ADS_API_VERSION}/customers/${env.GOOGLE_ADS_CUSTOMER_ID.replace(/-/g, "")}/googleAds:searchStream`,
              init: {
                method: "POST",
                headers: { ...cabecalhos, "content-type": "application/json" },
                body: JSON.stringify({
                  query: `SELECT segments.date, metrics.cost_micros FROM customer WHERE segments.date BETWEEN '${range.from}' AND '${range.to}'`,
                }),
              },
            },
            (d) => {
              const blocos = d as Array<{ results?: unknown[] }>;
              const linhas = blocos.flatMap((b) => b.results ?? []);
              return linhas.length === 0
                ? "Consulta aceita, mas sem linhas — nenhuma entrega no período."
                : `${linhas.length} dia(s) com dado.`;
            },
          ),
        );
      }
    } else {
      etapas.push({
        etapa: "ads-acesso",
        descricao: "O developer token é aceito?",
        status: null,
        ok: false,
        resultado:
          "GOOGLE_ADS_DEVELOPER_TOKEN não configurado. Sai do API Center da conta gerente (MCC).",
      });
    }
  }

  const primeiraFalha = etapas.find((e) => !e.ok);

  return NextResponse.json(
    {
      conclusao: primeiraFalha
        ? `Quebra na etapa "${primeiraFalha.etapa}": ${primeiraFalha.descricao}`
        : "Cadeia completa funcionando para os canais configurados.",
      escopos: {
        concedidos: escopos || null,
        // Escopo ausente é a causa mais comum de 403 que parece problema de conta.
        adwords: temEscopoAds,
        analytics: temEscopoAnalytics,
      },
      configuracao: {
        versaoApiAds: env.GOOGLE_ADS_API_VERSION,
        propriedadeGa4: env.GA4_PROPERTY_ID ? mascarar(env.GA4_PROPERTY_ID) : null,
        contaAds: env.GOOGLE_ADS_CUSTOMER_ID ? mascarar(env.GOOGLE_ADS_CUSTOMER_ID) : null,
        usaContaGerente: Boolean(env.GOOGLE_ADS_LOGIN_CUSTOMER_ID),
        credenciais: getCredentials(),
      },
      etapas,
    },
    { headers },
  );
}
