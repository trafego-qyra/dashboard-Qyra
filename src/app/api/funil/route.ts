import { NextResponse } from "next/server";

import { getCredentials } from "@/server/env";
import { lerEtapa, registrarEtapa } from "@/server/funil/lp";
import { apiError, guard } from "@/server/lib/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 15;

/**
 * Onde a LP de planos avisa cada tela que a pessoa viu.
 *
 * É o que desenha o funil do questionário na tela de Comportamento: em qual
 * pergunta as pessoas desistem. Cada chamada é uma linha — sessão, etapa, LP e
 * UTMs —, sem nome, contato ou resposta.
 *
 * **Fica fora do porteiro do painel**, como a ponte de captura: quem chama é o
 * navegador de um visitante, em outro domínio e sem sessão, e não existe
 * segredo possível dentro de uma página pública. O que segura a porta:
 *
 * - etapa e LP de listas fechadas, sessão em formato de UUID;
 * - corpo com teto de tamanho;
 * - origem restrita aos domínios das LPs;
 * - o rate limit de sempre.
 *
 * O pior caso que sobra é alguém inflar o próprio funil com sessões inventadas,
 * o que distorce um gráfico e não expõe dado de ninguém.
 */

/** As LPs e os previews do Cloudflare Pages. Domínios da casa, não são segredo. */
const ORIGENS = new Set(["https://planos.qyra.com.br", "https://qyra-lp.pages.dev"]);
const PREVIEW = /^https:\/\/[a-z0-9-]+\.qyra-lp\.pages\.dev$/;

/** Uma etapa cabe com folga nisto. */
const TETO_DO_CORPO = 2_048;

function origemAceita(origem: string | null): boolean {
  return origem !== null && (ORIGENS.has(origem) || PREVIEW.test(origem));
}

function cabecalhosDaOrigem(request: Request, base: Headers | Record<string, string>): Headers {
  const headers = new Headers(base);
  const origem = request.headers.get("origin");

  if (origemAceita(origem)) {
    headers.set("access-control-allow-origin", origem as string);
    headers.set("vary", "origin");
  }

  return headers;
}

/**
 * A consulta que o navegador faz antes de um POST com `content-type: json`.
 *
 * A LP manda por `sendBeacon`, que vai como texto e dispensa esta consulta;
 * ela fica para o caminho de reserva, que usa `fetch`.
 */
export async function OPTIONS(request: Request) {
  const headers = cabecalhosDaOrigem(request, {
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
  });

  return new NextResponse(null, { status: 204, headers });
}

export async function POST(request: Request) {
  const { headers: base, blocked } = guard(request);
  if (blocked) return blocked;

  const headers = cabecalhosDaOrigem(request, base);

  // Sem `Origin` não é navegador numa LP: é chamada montada à mão.
  if (!origemAceita(request.headers.get("origin"))) {
    return apiError("origem_recusada", "Origem não autorizada.", 403, headers);
  }

  if (!getCredentials().banco) {
    return apiError("sem_banco", "Sem banco configurado.", 503, headers);
  }

  const bruto = await request.text();
  if (bruto.length > TETO_DO_CORPO) {
    return apiError("corpo_grande", "Corpo acima do limite.", 413, headers);
  }

  let corpo: unknown;
  try {
    corpo = JSON.parse(bruto);
  } catch {
    return apiError("corpo_invalido", "Corpo não é JSON.", 400, headers);
  }

  const etapa = lerEtapa(corpo);
  if (!etapa) return apiError("etapa_invalida", "Etapa desconhecida.", 422, headers);

  try {
    await registrarEtapa(etapa);
    return new NextResponse(null, { status: 204, headers });
  } catch {
    // A pessoa segue o questionário de qualquer jeito: o funil perde um ponto,
    // e o detalhe não serve de nada ao navegador.
    return apiError("falha_ao_gravar", "Não foi possível guardar.", 500, headers);
  }
}
