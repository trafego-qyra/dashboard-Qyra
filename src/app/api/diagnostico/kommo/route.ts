import { NextResponse } from "next/server";

import { autorizacao, baseDaApi } from "@/server/connectors/kommo";
import { getCredentials, getEnv } from "@/server/env";
import { conferirCaptura } from "@/server/kommo/captura";
import { montarConclusao } from "@/server/kommo/conclusao";
import { guard } from "@/server/lib/api";
import { descreverFalha, httpJson } from "@/server/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * As etapas do funil, com o id de cada uma.
 *
 * Existe por uma razão só: `KOMMO_ETAPA_QUALIFICADO` precisa do id numérico da
 * etapa, e esse número não aparece em lugar nenhum da interface do Kommo. Sem
 * esta rota, descobri-lo seria tentativa e erro sobre dado de produção.
 *
 * `142` (ganho) e `143` (perdido) são fixos em toda conta, herdados do amoCRM.
 * O resto é o que a clínica criou.
 */

interface RespostaDeFunis {
  _embedded?: {
    pipelines?: Array<{
      id: number;
      name?: string;
      _embedded?: { statuses?: Array<{ id: number; name?: string; sort?: number }> };
    }>;
  };
}

export async function GET(request: Request) {
  const { headers, blocked } = guard(request);
  if (blocked) return blocked;

  if (!getCredentials().vendas) {
    return NextResponse.json(
      { conclusao: "Sem credencial do Kommo.", falta: ["KOMMO_SUBDOMAIN", "KOMMO_ACCESS_TOKEN"] },
      { status: 200, headers },
    );
  }

  const env = getEnv();

  try {
    const resposta = await httpJson<RespostaDeFunis>(`${baseDaApi()}/leads/pipelines`, {
      headers: autorizacao(),
    });

    const funis = (resposta._embedded?.pipelines ?? []).map((funil) => ({
      id: funil.id,
      nome: funil.name ?? "—",
      etapas: (funil._embedded?.statuses ?? [])
        .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
        .map((etapa) => ({
          id: etapa.id,
          nome: etapa.name ?? "—",
          fixa: etapa.id === 142 ? "venda ganha" : etapa.id === 143 ? "perdido" : undefined,
        })),
    }));

    // Enfeite: a lista de etapas continua útil se a amostra falhar.
    const captura = await conferirCaptura().catch(() => null);

    return NextResponse.json(
      {
        conclusao: montarConclusao(
          {
            pipelineId: env.KOMMO_PIPELINE_ID,
            etapaQualificado: env.KOMMO_ETAPA_QUALIFICADO,
            temSegredoDoWebhook: Boolean(env.KOMMO_WEBHOOK_SECRET),
          },
          funis,
          captura,
        ),
        configuradoHoje: {
          KOMMO_PIPELINE_ID: env.KOMMO_PIPELINE_ID ?? null,
          KOMMO_ETAPA_QUALIFICADO: env.KOMMO_ETAPA_QUALIFICADO ?? null,
          webhookConfigurado: Boolean(env.KOMMO_WEBHOOK_SECRET),
        },
        // Quantos negócios recentes chegam com identificador de clique. É a
        // causa do que o placar da tela de Vendas mostra como resultado.
        captura,
        funis,
      },
      { headers },
    );
  } catch (erro) {
    return NextResponse.json(
      { conclusao: "O Kommo não respondeu.", detalhe: descreverFalha(erro) },
      { status: 200, headers },
    );
  }
}
