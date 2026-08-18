import "server-only";

import { getEnv } from "@/server/env";

/**
 * Rate limit por janela fixa, em memória.
 *
 * Protege as rotas de API contra loop de cliente e scraping. Não é uma
 * barreira distribuída — em múltiplas instâncias cada uma aplica o próprio
 * teto; para limite global, trocar por Upstash/Vercel KV (ver docs/qualidade.md).
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
}

export function rateLimit(
  identifier: string,
  limit = getEnv().RATE_LIMIT_MAX,
  windowMs = getEnv().RATE_LIMIT_WINDOW_MS,
): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(identifier);

  if (!bucket || bucket.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(identifier, { count: 1, resetAt });
    return { ok: true, limit, remaining: limit - 1, resetAt, retryAfterSeconds: 0 };
  }

  bucket.count += 1;
  const remaining = Math.max(0, limit - bucket.count);

  return {
    ok: bucket.count <= limit,
    limit,
    remaining,
    resetAt: bucket.resetAt,
    retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1_000),
  };
}

/** Identidade da chamada: IP do proxy da Vercel, com fallback. */
export function clientIdentifier(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "anon";
}

export function resetRateLimit(): void {
  buckets.clear();
}
