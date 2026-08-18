import { NextResponse } from "next/server";

import { parseRange } from "@/lib/date-range";
import { CHANNEL_IDS, type ChannelId } from "@/lib/types";
import { apiError, guard } from "@/server/lib/api";
import { getChannelReport } from "@/server/reports";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Agregar quatro plataformas em paralelo pode passar dos 15s padrão da Vercel.
export const maxDuration = 30;

/** GET /api/v1/reports/:channel?preset=28d | ?from=&to= */
export async function GET(request: Request, { params }: { params: Promise<{ channel: string }> }) {
  const { headers, blocked } = guard(request);
  if (blocked) return blocked;

  const { channel } = await params;
  if (!CHANNEL_IDS.includes(channel as ChannelId)) {
    return apiError("unknown_channel", `Canal "${channel}" não existe.`, 404, headers);
  }

  const url = new URL(request.url);
  const { range } = parseRange({
    preset: url.searchParams.get("preset") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });

  try {
    const report = await getChannelReport(channel as ChannelId, range);
    return NextResponse.json(report, { headers });
  } catch (error) {
    // A mensagem da API externa pode conter identificadores de conta: não vaza.
    console.error(`[api] falha ao carregar ${channel}`, error);
    return apiError(
      "connector_failed",
      "Não foi possível carregar os dados do canal.",
      502,
      headers,
    );
  }
}
