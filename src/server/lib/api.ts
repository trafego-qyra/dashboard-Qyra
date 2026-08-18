import "server-only";

import { NextResponse } from "next/server";

import { clientIdentifier, rateLimit } from "./rate-limit";

/**
 * Utilitários das rotas HTTP. A fronteira backend/frontend do projeto: tudo
 * que fala com segredo ou API externa vive atrás daqui.
 */

export interface ApiErrorBody {
  error: { code: string; message: string };
}

export function apiError(
  code: string,
  message: string,
  status: number,
  headers?: HeadersInit,
): NextResponse<ApiErrorBody> {
  return NextResponse.json({ error: { code, message } }, { status, headers });
}

/**
 * Aplica o rate limit e devolve os cabeçalhos padrão.
 * Retorna a resposta 429 pronta quando o teto estoura.
 */
export function guard(request: Request): {
  headers: Record<string, string>;
  blocked: NextResponse<ApiErrorBody> | null;
} {
  const result = rateLimit(clientIdentifier(request));
  const headers = {
    "x-ratelimit-limit": String(result.limit),
    "x-ratelimit-remaining": String(result.remaining),
    "x-ratelimit-reset": String(Math.ceil(result.resetAt / 1_000)),
  };

  if (!result.ok) {
    return {
      headers,
      blocked: apiError("rate_limited", "Muitas requisições. Tente novamente em instantes.", 429, {
        ...headers,
        "retry-after": String(result.retryAfterSeconds),
      }),
    };
  }

  return { headers, blocked: null };
}
