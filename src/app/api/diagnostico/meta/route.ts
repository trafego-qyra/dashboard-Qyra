import { NextResponse } from "next/server";

import { rangeFromPreset } from "@/lib/date-range";
import { getCredentials, getEnv } from "@/server/env";
import { guard } from "@/server/lib/api";
import { redactSecrets } from "@/server/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Diagnóstico da integração com a Meta.
 *
 * Executa, em sequência, as mesmas chamadas que o conector faz — da mais
 * simples à mais completa — e devolve o resultado de cada uma. Existe porque
 * depurar integração a distância, uma hipótese por vez, é lento e frustrante:
 * uma requisição aqui responde em que degrau exatamente a coisa quebra.
 *
 * Nenhum segredo sai na resposta. O token é substituído antes do envio, e a
 * identificação da conta sai mascarada no meio.
 */

interface Etapa {
  etapa: string;
  descricao: string;
  status: number | null;
  ok: boolean;
  resultado: string;
}

/** `act_1610215746739005` → `act_1610…9005`. */
function mascarar(valor: string): string {
  if (valor.length <= 12) return valor;
  return `${valor.slice(0, 8)}…${valor.slice(-4)}`;
}

async function executar(
  etapa: string,
  descricao: string,
  url: string,
  resumir: (dados: unknown) => string,
): Promise<Etapa> {
  try {
    const resposta = await fetch(url, {
      headers: { accept: "application/json" },
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
  const token = env.META_ACCESS_TOKEN;
  const contaBruta = env.META_AD_ACCOUNT_ID;

  if (!token || !contaBruta) {
    return NextResponse.json(
      {
        conclusao: "Credencial ausente — nada a testar.",
        credencial: {
          tokenPresente: Boolean(token),
          contaPresente: Boolean(contaBruta),
        },
      },
      { status: 200, headers },
    );
  }

  const conta = contaBruta.startsWith("act_") ? contaBruta : `act_${contaBruta}`;
  const versao = env.META_API_VERSION;
  const range = rangeFromPreset("7d");
  const base = `https://graph.facebook.com/${versao}`;
  const auth = `access_token=${encodeURIComponent(token)}`;
  const periodo = `time_range=${encodeURIComponent(JSON.stringify({ since: range.from, until: range.to }))}`;

  const etapas: Etapa[] = [];

  // 1. O token é válido e de quem?
  etapas.push(
    await executar(
      "token",
      "O token é aceito pela Meta?",
      `${base}/me?fields=id,name&${auth}`,
      (d) => {
        const dados = d as { id?: string; name?: string };
        return `Aceito. Identidade ${mascarar(dados.id ?? "?")}${dados.name ? ` (${dados.name})` : ""}.`;
      },
    ),
  );

  // 2. O token enxerga a conta configurada?
  etapas.push(
    await executar(
      "conta",
      "A conta configurada está entre as que o token enxerga?",
      `${base}/me/adaccounts?fields=account_id,name&limit=50&${auth}`,
      (d) => {
        const dados = d as { data?: Array<{ account_id?: string; name?: string }> };
        const contas = (dados.data ?? []).map((c) => `act_${c.account_id}`);
        const encontrada = contas.includes(conta);
        return encontrada
          ? `Sim. ${contas.length} conta(s) visível(is), incluindo a configurada.`
          : `NÃO. O token enxerga ${contas.length} conta(s), e a configurada (${mascarar(conta)}) não está entre elas.`;
      },
    ),
  );

  // 3. A conta responde a uma consulta trivial de insights?
  etapas.push(
    await executar(
      "insights-minimo",
      "Consulta mínima de insights (só investimento, período inteiro)",
      `${base}/${conta}/insights?fields=spend&${periodo}&${auth}`,
      (d) => {
        const dados = d as { data?: Array<Record<string, string>> };
        const linhas = dados.data ?? [];
        if (linhas.length === 0) {
          return `Consulta aceita, mas SEM LINHAS. A conta não teve entrega entre ${range.from} e ${range.to}.`;
        }
        return `${linhas.length} linha(s). Investimento no período: ${linhas[0].spend ?? "?"}.`;
      },
    ),
  );

  // 4. A consulta completa que o conector faz de verdade.
  etapas.push(
    await executar(
      "insights-diario",
      "Consulta diária completa, igual à do conector",
      `${base}/${conta}/insights?fields=spend,impressions,clicks,ctr,actions&time_increment=1&level=account&limit=500&${periodo}&${auth}`,
      (d) => {
        const dados = d as { data?: Array<Record<string, unknown>> };
        const linhas = dados.data ?? [];
        if (linhas.length === 0) {
          return "Consulta aceita, mas SEM LINHAS — nenhum dia com entrega no período.";
        }
        const comAcoes = linhas.filter((l) => Array.isArray(l.actions)).length;
        const tipos = new Set<string>();
        for (const linha of linhas) {
          for (const acao of (linha.actions as Array<{ action_type: string }> | undefined) ?? []) {
            tipos.add(acao.action_type);
          }
        }
        return `${linhas.length} dia(s) com dado; ${comAcoes} com ações. Tipos de ação vistos: ${
          tipos.size === 0 ? "nenhum" : [...tipos].slice(0, 25).join(", ")
        }.`;
      },
    ),
  );

  // 5. Nível campanha.
  etapas.push(
    await executar(
      "insights-campanha",
      "Consulta por campanha",
      `${base}/${conta}/insights?fields=campaign_name,spend&level=campaign&limit=500&${periodo}&${auth}`,
      (d) => {
        const dados = d as { data?: Array<{ campaign_name?: string }> };
        const linhas = dados.data ?? [];
        return linhas.length === 0
          ? "Consulta aceita, mas SEM LINHAS — nenhuma campanha com entrega no período."
          : `${linhas.length} campanha(s) com entrega.`;
      },
    ),
  );

  const primeiraFalha = etapas.find((e) => !e.ok);

  return NextResponse.json(
    {
      conclusao: primeiraFalha
        ? `Quebra na etapa "${primeiraFalha.etapa}": ${primeiraFalha.descricao}`
        : "Todas as etapas passaram. Se o painel ainda aparece vazio, o problema está na montagem do relatório, não na integração.",
      periodoTestado: range,
      configuracao: {
        versaoApi: versao,
        conta: mascarar(conta),
        contaTinhaPrefixo: contaBruta.startsWith("act_"),
        // Formato do token, sem revelá-lo: é o que distingue "credencial
        // errada" de "credencial certa com lixo colado junto".
        token: {
          tamanho: token.length,
          comecaCom: token.slice(0, 6),
          terminaCom: token.slice(-6),
          temEspacoEmQualquerLugar: /\s/.test(token),
          temCaractereNaoAscii: /[^\x20-\x7E]/.test(token),
          caracteresInesperados: [...new Set(token.replace(/[A-Za-z0-9]/g, ""))].join(" "),
        },
        credenciais: getCredentials(),
      },
      etapas,
    },
    { headers },
  );
}
