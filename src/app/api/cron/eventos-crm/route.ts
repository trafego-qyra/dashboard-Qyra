import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { expurgar as expurgarPonte } from "@/server/captura/ponte";
import { getCredentials, getEnv } from "@/server/env";
import { despachar, expurgar, resumo } from "@/server/fila/eventos-crm";
import { apiError } from "@/server/lib/api";
import { descreverFalha } from "@/server/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * A varredura diária: manda o que ficou para trás e apaga o que venceu.
 *
 * O webhook já tenta enviar na hora, então em dia normal esta rota não faz
 * nada. Ela existe para os dias que não são normais — a Meta fora do ar, uma
 * entrega do Kommo perdida, um deploy no meio do caminho. **Webhook falha
 * calado**, e sem uma segunda passagem a venda some sem ninguém notar.
 *
 * A própria Meta pede carga ao menos uma vez por dia. Isso também.
 *
 * O expurgo mora aqui pela mesma razão: é o único lugar que acontece todo dia
 * sem ninguém mandar.
 */

/**
 * A Vercel manda `Authorization: Bearer $CRON_SECRET` nas chamadas agendadas.
 *
 * Sem `CRON_SECRET` configurado a rota fica fechada. Aberta, ela seria um botão
 * público de "mande tudo de novo para a Meta" — e, pior, de apagar histórico.
 */
function autorizado(request: Request): boolean {
  const esperado = getEnv().CRON_SECRET;
  if (!esperado) return false;

  const recebido = request.headers.get("authorization") ?? "";
  const a = Buffer.from(recebido);
  const b = Buffer.from(`Bearer ${esperado}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  if (!autorizado(request)) {
    return apiError("nao_encontrado", "Não encontrado.", 404);
  }

  if (!getCredentials().banco) {
    return apiError("sem_banco", "Sem banco configurado.", 503);
  }

  try {
    // Despachar primeiro: expurgar antes apagaria um evento velho que ainda
    // não tinha sido enviado, e o certo é tentar mandá-lo uma última vez.
    const envio = await despachar();
    const apagados = await expurgar();
    // A ponte guarda captura de quem ainda não comprou. Passados noventa dias,
    // a janela de atribuição da Meta já fechou e a linha virou dado sem
    // finalidade. Falhar aqui não pode derrubar a varredura das vendas.
    await expurgarPonte().catch(() => undefined);
    const fila = await resumo();

    return NextResponse.json({
      conclusao:
        envio.tentados === 0
          ? "Nada pendente — o webhook deu conta."
          : `${envio.recebidos} de ${envio.tentados} evento(s) atrasado(s) foram enviados.`,
      envio,
      apagados,
      fila,
    });
  } catch (erro) {
    // 500 para a Vercel registrar a falha na aba de execuções do cron. Silêncio
    // aqui faria a varredura morrer sem ninguém saber — justamente o problema
    // que ela existe para resolver.
    return NextResponse.json(
      { conclusao: "A varredura falhou.", detalhe: descreverFalha(erro) },
      { status: 500 },
    );
  }
}
