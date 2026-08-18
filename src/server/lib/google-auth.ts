import "server-only";

import { env } from "@/server/env";
import { httpJson } from "./http";

/**
 * Troca o refresh token por um access token do Google (OAuth 2.0, app instalado).
 * O mesmo token serve Google Ads e GA4 — os escopos são pedidos juntos no
 * consentimento (ver docs/integracoes.md).
 */

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

export async function getGoogleAccessToken(): Promise<string> {
  const now = Date.now();
  // 60s de folga para não usar um token que expira no meio da chamada.
  if (cachedToken && cachedToken.expiresAt - 60_000 > now) return cachedToken.value;

  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REFRESH_TOKEN) {
    throw new Error("Credenciais OAuth do Google ausentes.");
  }

  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    refresh_token: env.GOOGLE_REFRESH_TOKEN,
    grant_type: "refresh_token",
  });

  const token = await httpJson<TokenResponse>("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  cachedToken = { value: token.access_token, expiresAt: now + token.expires_in * 1_000 };
  return token.access_token;
}
