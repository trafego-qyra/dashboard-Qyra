import { NextResponse } from "next/server";

import { getCredentials } from "@/server/env";
import { sondarConversas } from "@/server/kommo/conversas";
import { guard } from "@/server/lib/api";
import { descreverFalha } from "@/server/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * O que dá para ler de conversa no Kommo.
 *
 * Existe porque a resposta não está em documentação nenhuma: a integração de
 * WhatsApp é de terceiro, e onde ela grava a conversa varia por integração.
 * Esta rota pergunta à API em vez de supor.
 *
 * **Ela relata a forma, nunca o conteúdo.** A resposta de um diagnóstico acaba
 * colada em conversa e em captura de tela, e conversa de paciente sobre
 * emagrecimento e injetável é dado sensível de saúde. Tipo, quantidade, autor
 * e tamanho bastam para decidir o que construir depois.
 */
export async function GET(request: Request) {
  const { headers, blocked } = guard(request);
  if (blocked) return blocked;

  if (!getCredentials().vendas) {
    return NextResponse.json(
      { conclusao: "Sem credencial do Kommo.", falta: ["KOMMO_SUBDOMAIN", "KOMMO_ACCESS_TOKEN"] },
      { status: 200, headers },
    );
  }

  try {
    return NextResponse.json(await sondarConversas(), { headers });
  } catch (erro) {
    return NextResponse.json(
      { conclusao: "A sondagem falhou.", detalhe: descreverFalha(erro) },
      { status: 200, headers },
    );
  }
}
