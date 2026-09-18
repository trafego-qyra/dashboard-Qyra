import { NextResponse } from "next/server";

import { lerCaptura, registrar } from "@/server/captura/ponte";
import { getCredentials } from "@/server/env";
import { apiError, guard } from "@/server/lib/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 15;

/**
 * Onde o navegador do questionário entrega o identificador do clique.
 *
 * A pessoa clica no anúncio, chega na landing page e atravessa para o
 * questionário — que grava um `cliente_id` no negócio do Kommo, mas não grava
 * o `fbc`. Esta rota recebe o par `cliente_id -> fbc` de dentro do navegador,
 * e o webhook do Kommo o resgata na hora do GANHO.
 *
 * **Fica fora do porteiro do painel**, como o webhook do Kommo: quem chama é o
 * navegador de um visitante, que não tem sessão. Só que aqui não existe segredo
 * possível — qualquer valor embutido numa tag do GTM é público por definição.
 * O que segura a porta é outra coisa:
 *
 * - o `cliente_id` precisa ser um UUID, e adivinhar um é inviável;
 * - `fbc` e `fbp` precisam ter o formato exato da Meta;
 * - o corpo tem teto de tamanho;
 * - a origem precisa ser um domínio da Qyra.
 *
 * O pior caso que sobra é alguém alterar a atribuição do **próprio**
 * `cliente_id`, que é dado dele. Está registrado em docs/seguranca.md.
 */

/** De onde o navegador pode chamar. Domínios da casa, não são segredo. */
const ORIGENS = new Set([
  "https://questionario.qyra.com.br",
  "https://qyra.com.br",
  "https://www.qyra.com.br",
  "https://app.qyra.com.br",
]);

/** Corpo maior que isto não é captura, é abuso. */
const TETO_DO_CORPO = 4_096;

function cabecalhosDaOrigem(request: Request, base: Headers | Record<string, string>): Headers {
  const headers = new Headers(base);
  const origem = request.headers.get("origin");

  if (origem && ORIGENS.has(origem)) {
    headers.set("access-control-allow-origin", origem);
    headers.set("vary", "origin");
  }

  return headers;
}

/**
 * A consulta que o navegador faz antes do POST com `content-type: json`.
 *
 * Sem ela o navegador nem chega a mandar a captura — e o erro aparece no
 * console de quem visita o site, não no nosso log.
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

  const origem = request.headers.get("origin");
  if (origem && !ORIGENS.has(origem)) {
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

  const captura = lerCaptura(corpo);
  if (!captura) {
    // Visita orgânica cai aqui o tempo todo: tem `cliente_id` e nenhum clique.
    // Não é erro de quem chamou, e responder 400 encheria o console do site de
    // vermelho por um caso que é o esperado.
    return NextResponse.json({ guardado: false, motivo: "nada a guardar" }, { headers });
  }

  try {
    await registrar(captura);
    return NextResponse.json({ guardado: true }, { headers });
  } catch {
    // O navegador não tem o que fazer com o detalhe, e a venda não depende
    // disto: o webhook ainda manda telefone e e-mail.
    return apiError("falha_ao_gravar", "Não foi possível guardar.", 500, headers);
  }
}
