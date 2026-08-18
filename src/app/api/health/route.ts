import { NextResponse } from "next/server";

import { credentials } from "@/server/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Liveness + prontidão das integrações. Reporta apenas se a credencial existe —
 * nunca o valor, nem o identificador da conta.
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    uptimeSeconds: Math.round(process.uptime()),
    integrations: credentials,
  });
}
