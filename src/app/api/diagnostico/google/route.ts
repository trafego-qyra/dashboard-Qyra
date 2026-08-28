import { NextResponse } from "next/server";
import { rangeFromPreset } from "@/lib/date-range";
import { VERSOES_CANDIDATAS } from "@/server/connectors/google-ads";
import { type Etapa, veredictoDoToken } from "@/server/diagnostico/veredicto-ads";
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

    // 2b. GA4 — de ONDE vem o tráfego que chega.
    //     Volume muito abaixo do esperado tem três causas com o mesmo sintoma:
    //     propriedade errada, tag ausente, ou anúncio que leva para outro
    //     domínio. O nome do host e a origem separam as três.
    if (env.GA4_PROPERTY_ID) {
      const range = rangeFromPreset("7d");
      etapas.push(
        await requisitar(
          "ga4-origem",
          "De qual domínio e de qual origem vêm as sessões?",
          {
            url: `https://analyticsdata.googleapis.com/v1beta/properties/${env.GA4_PROPERTY_ID}:runReport`,
            init: {
              method: "POST",
              headers: { ...auth, "content-type": "application/json" },
              body: JSON.stringify({
                dateRanges: [{ startDate: range.from, endDate: range.to }],
                dimensions: [
                  { name: "hostName" },
                  { name: "sessionSource" },
                  { name: "sessionMedium" },
                ],
                metrics: [{ name: "sessions" }],
                orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
                limit: 20,
              }),
            },
          },
          (d) => {
            const dados = d as {
              rows?: Array<{
                dimensionValues?: Array<{ value?: string }>;
                metricValues?: Array<{ value?: string }>;
              }>;
            };
            const linhas = dados.rows ?? [];
            if (linhas.length === 0) {
              return "Nenhuma sessão no período. Ou a tag não está disparando, ou o tráfego não passa por este site.";
            }
            return linhas
              .map((linha) => {
                const [host, origem, meio] = (linha.dimensionValues ?? []).map(
                  (v) => v.value ?? "?",
                );
                return `${host} · ${origem}/${meio}: ${linha.metricValues?.[0]?.value ?? "?"}`;
              })
              .join(" | ");
          },
        ),
      );
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

      // Versão aposentada não devolve erro de API: a URL some e o Google
      // responde 404 com página HTML. Descobrir qual responde é o que separa
      // "token sem permissão" de "estamos chamando um endereço que não existe".
      let versaoAds: string | null = env.GOOGLE_ADS_API_VERSION ?? null;
      if (!versaoAds) {
        for (const candidata of VERSOES_CANDIDATAS) {
          try {
            const teste = await fetch(
              `https://googleads.googleapis.com/${candidata}/customers:listAccessibleCustomers`,
              { headers: cabecalhos, signal: AbortSignal.timeout(10_000) },
            );
            if (teste.status !== 404) {
              versaoAds = candidata;
              break;
            }
          } catch {
            // Falha de rede não distingue versão; segue para a próxima.
          }
        }
      }

      etapas.push({
        etapa: "ads-versao",
        descricao: "Qual versão da API do Google Ads ainda existe?",
        status: null,
        ok: versaoAds !== null,
        resultado: versaoAds
          ? `Respondendo em ${versaoAds}.${
              env.GOOGLE_ADS_API_VERSION
                ? " Fixada por GOOGLE_ADS_API_VERSION."
                : " Descoberta automaticamente — cadastre GOOGLE_ADS_API_VERSION com esse valor para fixar."
            }`
          : `Nenhuma das versões testadas respondeu (${VERSOES_CANDIDATAS.join(", ")}). A lista de candidatas provavelmente envelheceu.`,
      });

      etapas.push(
        await requisitar(
          "ads-acesso",
          "Quais contas este login alcança? (não prova aprovação do token)",
          {
            url: `https://googleads.googleapis.com/${versaoAds}/customers:listAccessibleCustomers`,
            init: { headers: cabecalhos },
          },
          (d) => {
            const dados = d as { resourceNames?: string[] };
            const contas = (dados.resourceNames ?? []).map((r) => r.replace("customers/", ""));
            const alvo = env.GOOGLE_ADS_CUSTOMER_ID?.replace(/-/g, "");
            const encontrada = alvo ? contas.includes(alvo) : false;

            // Duas armadilhas nesta chamada, e as duas já custaram uma
            // conclusão errada.
            //
            // Ela **responde 200 com token de acesso de teste**. Passar aqui não
            // diz nada sobre aprovação — quem prova isso é a consulta a uma
            // conta de produção, na etapa seguinte.
            //
            // E ela **ignora `login-customer-id`**: lista o que o usuário do
            // OAuth alcança direto. Por isso a ausência da conta gerente aqui é
            // informação, e não detalhe.
            const gerente = env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(/-/g, "");
            const gerenteAlcancavel = gerente ? contas.includes(gerente) : null;

            return `${contas.length} conta(s) acessível(is): ${contas.map(mascarar).join(", ")}. Esta chamada responde mesmo com token de acesso de teste, então passar aqui não prova aprovação.${
              alvo
                ? encontrada
                  ? " A conta configurada está entre elas."
                  : ` A conta configurada (${mascarar(alvo)}) NÃO está entre elas.`
                : " GOOGLE_ADS_CUSTOMER_ID não configurado."
            }${
              gerenteAlcancavel === false
                ? ` A conta gerente configurada (${mascarar(gerente as string)}) NÃO está entre elas — este login não a alcança, e entrar por ela é o que devolve 403 na consulta.`
                : gerenteAlcancavel === true
                  ? " A conta gerente configurada também está entre elas."
                  : ""
            }`;
          },
        ),
      );

      // 4. Google Ads — a consulta real funciona?
      if (env.GOOGLE_ADS_CUSTOMER_ID) {
        const range = rangeFromPreset("7d");
        const consulta = `SELECT segments.date, metrics.cost_micros FROM customer WHERE segments.date BETWEEN '${range.from}' AND '${range.to}'`;
        const enderecoDaConsulta = `https://googleads.googleapis.com/${versaoAds}/customers/${env.GOOGLE_ADS_CUSTOMER_ID.replace(/-/g, "")}/googleAds:searchStream`;

        const resumirConsulta = (d: unknown) => {
          const blocos = d as Array<{ results?: unknown[] }>;
          const linhas = blocos.flatMap((b) => b.results ?? []);
          return linhas.length === 0
            ? "Consulta aceita, mas sem linhas — nenhuma entrega no período."
            : `${linhas.length} dia(s) com dado.`;
        };

        etapas.push(
          await requisitar(
            "ads-consulta",
            "A consulta GAQL do conector responde?",
            {
              url: `https://googleads.googleapis.com/${versaoAds}/customers/${env.GOOGLE_ADS_CUSTOMER_ID.replace(/-/g, "")}/googleAds:searchStream`,
              init: {
                method: "POST",
                headers: { ...cabecalhos, "content-type": "application/json" },
                body: JSON.stringify({ query: consulta }),
              },
            },
            resumirConsulta,
          ),
        );

        // 4b. A mesma consulta, sem entrar pela conta gerente.
        //
        // Só roda quando a de cima falhou e existe gerente configurado, e é o
        // que transforma um palpite em resposta: se esta passa, o problema é o
        // cabeçalho `login-customer-id`, não a credencial nem a conta. Sem
        // isso, descobrir a causa exige apagar uma variável em produção e
        // torcer — que é exatamente o que ninguém deveria precisar fazer para
        // ler um diagnóstico.
        const consultaFalhou = etapas.at(-1)?.ok === false;
        if (consultaFalhou && env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) {
          const semGerente: Record<string, string> = {
            ...cabecalhos,
            "content-type": "application/json",
          };
          delete semGerente["login-customer-id"];

          etapas.push(
            await requisitar(
              "ads-consulta-sem-gerente",
              "E sem entrar pela conta gerente, a mesma consulta responde?",
              {
                url: enderecoDaConsulta,
                init: {
                  method: "POST",
                  headers: semGerente,
                  body: JSON.stringify({ query: consulta }),
                },
              },
              resumirConsulta,
            ),
          );
        }
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
      // A pergunta que mais se faz nesta página, respondida em uma linha em vez
      // de escondida dentro do texto cru de uma etapa. Enquanto o Google não
      // aprova o acesso básico, o Google Ads fica no snapshot exportado — e é
      // esta a única coisa que decide se a tela vira tempo real.
      tokenDeDesenvolvedor: veredictoDoToken(etapas),
      escopos: {
        concedidos: escopos || null,
        // Escopo ausente é a causa mais comum de 403 que parece problema de conta.
        adwords: temEscopoAds,
        analytics: temEscopoAnalytics,
      },
      configuracao: {
        versaoApiAds: env.GOOGLE_ADS_API_VERSION ?? "descoberta automaticamente",
        propriedadeGa4: env.GA4_PROPERTY_ID ? mascarar(env.GA4_PROPERTY_ID) : null,
        contaAds: env.GOOGLE_ADS_CUSTOMER_ID ? mascarar(env.GOOGLE_ADS_CUSTOMER_ID) : null,
        usaContaGerente: Boolean(env.GOOGLE_ADS_LOGIN_CUSTOMER_ID),
        // Pontas do token de desenvolvedor, para conferir contra a Central de
        // API sem o valor sair daqui.
        //
        // Existe porque há um caso que nenhuma outra linha desta resposta
        // distingue: o acesso básico aprovado num token e o painel usando
        // outro — gerado noutra conta gerente, ou regerado depois. Os dois
        // cenários produzem exatamente o mesmo `DEVELOPER_TOKEN_NOT_APPROVED`,
        // e sem comparar as pontas a investigação anda em círculo.
        tokenDesenvolvedor: env.GOOGLE_ADS_DEVELOPER_TOKEN
          ? mascarar(env.GOOGLE_ADS_DEVELOPER_TOKEN)
          : null,
        credenciais: getCredentials(),
      },
      etapas,
    },
    { headers },
  );
}
