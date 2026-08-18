import { NextResponse } from "next/server";

import { parseRange } from "@/lib/date-range";
import { apiError, guard } from "@/server/lib/api";
import { getOverviewReport } from "@/server/reports";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Agregar quatro plataformas em paralelo pode passar dos 15s padrão da Vercel.
export const maxDuration = 30;

/** GET /api/v1/overview?preset=28d | ?from=&to= */
export async function GET(request: Request) {
  const { headers, blocked } = guard(request);
  if (blocked) return blocked;

  const url = new URL(request.url);
  const { range } = parseRange({
    preset: url.searchParams.get("preset") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });

  try {
    return NextResponse.json(await getOverviewReport(range), { headers });
  } catch (error) {
    console.error("[api] falha ao carregar visão geral", error);
    return apiError("overview_failed", "Não foi possível carregar a visão geral.", 502, headers);
  }
}
