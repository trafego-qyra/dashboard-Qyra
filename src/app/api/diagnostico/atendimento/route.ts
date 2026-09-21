import { NextResponse } from "next/server";

import { parseRange } from "@/lib/date-range";
import { getCredentials } from "@/server/env";
import { medirAtendimento } from "@/server/kommo/atendimento";
import { guard } from "@/server/lib/api";
import { descreverFalha } from "@/server/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Quanto tempo o lead espera para ser atendido, no período pedido.
 *
 * Aceita o mesmo recorte do resto do painel — `?preset=7d` ou
 * `?from=2026-09-01&to=2026-09-20` — para que a resposta daqui possa ser
 * comparada com a tela de Vendas do mesmo intervalo sem conversão de cabeça.
 *
 * Entrada inválida não quebra: cai no preset padrão, como as telas.
 */
export async function GET(request: Request) {
  const { headers, blocked } = guard(request);
  if (blocked) return blocked;

  if (!getCredentials().vendas) {
    return NextResponse.json(
      { observacao: "Sem credencial do Kommo.", falta: ["KOMMO_SUBDOMAIN", "KOMMO_ACCESS_TOKEN"] },
      { status: 200, headers },
    );
  }

  const url = new URL(request.url);
  const { range } = parseRange({
    preset: url.searchParams.get("preset") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });

  try {
    return NextResponse.json(await medirAtendimento(range), { headers });
  } catch (erro) {
    return NextResponse.json(
      { observacao: "A medição falhou.", detalhe: descreverFalha(erro) },
      { status: 200, headers },
    );
  }
}
