import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { getCredentials, getEnv } from "@/server/env";
import { despachar, enfileirar } from "@/server/fila/eventos-crm";
import { eventosDaMudanca, lerMudancas } from "@/server/kommo/webhook";
import { apiError, guard } from "@/server/lib/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Onde o Kommo avisa que um negócio mudou de etapa.
 *
 * **O segredo vai no caminho, e isso é uma escolha com custo.** O Kommo não
 * assina os webhooks dele como o Stripe faz, e não deixa configurar cabeçalho
 * na entrega — então não existe jeito de autenticar que não seja pela própria
 * URL. Ela acaba em log de plataforma, e trocá-la exige reconfigurar do lado
 * do Kommo. Está registrado em docs/seguranca.md como limitação conhecida, e
 * não como problema resolvido.
 *
 * **Esta rota fica fora do porteiro do painel.** O `src/middleware.ts` libera
 * este caminho de propósito: quem chama é o Kommo, que não tem sessão. O
 * segredo é o que faz as vezes da senha aqui.
 */

/** Comparação de tempo constante, para o segredo não vazar pelo tempo de resposta. */
function segredoConfere(recebido: string, esperado: string): boolean {
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  // `timingSafeEqual` exige mesmo tamanho; o tamanho em si não é o segredo.
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request, { params }: { params: Promise<{ segredo: string }> }) {
  const { headers, blocked } = guard(request);
  if (blocked) return blocked;

  const env = getEnv();
  const esperado = env.KOMMO_WEBHOOK_SECRET;

  // Sem segredo configurado a rota fica fechada, não aberta. Variável esquecida
  // no painel da Vercel não pode virar endpoint público de escrita.
  if (!esperado) {
    return apiError("nao_configurado", "Webhook não configurado.", 404, headers);
  }

  const { segredo } = await params;
  if (!segredoConfere(segredo, esperado)) {
    // 404 em vez de 401: para quem varre caminhos, não existe diferença entre
    // "segredo errado" e "não tem nada aqui".
    return apiError("nao_encontrado", "Não encontrado.", 404, headers);
  }

  if (!getCredentials().vendas || !getCredentials().banco) {
    return apiError(
      "integracao_incompleta",
      "Kommo ou banco sem credencial — o evento não teria para onde ir.",
      503,
      headers,
    );
  }

  const mudancas = lerMudancas(await request.text());
  const eventos = await eventosDaMudanca(mudancas);

  // Mudança de etapa que não é qualificação nem venda é a maioria delas.
  // Responder 200 é o certo: o Kommo fez a parte dele.
  if (eventos.length === 0) {
    return NextResponse.json(
      { recebidas: mudancas.length, enfileirados: 0, motivo: "nenhuma etapa de interesse" },
      { headers },
    );
  }

  try {
    const gravacao = await enfileirar(eventos, (evento) => Number(evento.eventId.split("-")[1]));

    // Tenta mandar na hora. Falhar aqui não é problema: a linha fica pendente
    // e a varredura diária pega. O que não pode é o evento nunca ser gravado.
    const envio = await despachar().catch(() => null);

    return NextResponse.json(
      { recebidas: mudancas.length, ...gravacao, enviados: envio?.recebidos ?? 0 },
      { headers },
    );
  } catch {
    // 500 de propósito: o Kommo reenvia, e o `event_id` estável faz da segunda
    // entrega um silêncio. É a recuperação mais barata que existe aqui.
    return apiError("falha_ao_gravar", "Não foi possível registrar o evento.", 500, headers);
  }
}
