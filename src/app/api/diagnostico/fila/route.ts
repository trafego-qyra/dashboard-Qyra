import { NextResponse } from "next/server";
import { getCredentials } from "@/server/env";
import { resumo } from "@/server/fila/eventos-crm";
import { guard } from "@/server/lib/api";
import { descreverFalha } from "@/server/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Estado da fila de eventos de CRM.
 *
 * Responde duas perguntas de uma vez: o painel está falando com o banco, e
 * quanto do funil chega na Meta. O segundo número é o que vai justificar (ou
 * não) investir em capturar origem na conversa de WhatsApp — sem ele, "a
 * atribuição está ruim" é palpite.
 */

export async function GET(request: Request) {
  const { headers, blocked } = guard(request);
  if (blocked) return blocked;

  if (!getCredentials().banco) {
    return NextResponse.json(
      {
        conclusao: "Sem banco configurado — a fila não existe ainda.",
        falta: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
        comoResolver:
          "Crie o projeto no Supabase, rode docs/sql/evento-crm.sql no SQL Editor e cadastre as duas variáveis na Vercel.",
      },
      { status: 200, headers },
    );
  }

  try {
    const contagem = await resumo();
    const total = Object.values(contagem).reduce((a, b) => a + b, 0);
    const identificaveis = total - contagem.sem_identificador;

    return NextResponse.json(
      {
        conclusao:
          total === 0
            ? "Banco respondendo, fila vazia. Nada foi enfileirado ainda."
            : `${contagem.enviado} de ${total} evento(s) chegaram na Meta.`,
        fila: contagem,
        // A conta que importa: de tudo que o CRM produziu, quanto tinha como
        // ser identificado. O resto é funil que a Meta não enxerga.
        cobertura:
          total === 0
            ? null
            : {
                identificaveis,
                proporcao: Math.round((identificaveis / total) * 100) / 100,
              },
      },
      { headers },
    );
  } catch (erro) {
    return NextResponse.json(
      {
        conclusao: "O banco não respondeu.",
        detalhe: descreverFalha(erro),
        comoResolver:
          "Confira se docs/sql/evento-crm.sql já foi rodado no SQL Editor — a tabela evento_crm precisa existir.",
      },
      { status: 200, headers },
    );
  }
}
