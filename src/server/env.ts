import "server-only";

import { z } from "zod";

/**
 * Configuração do lado servidor. Este módulo é `server-only`: importá-lo de um
 * componente cliente quebra o build de propósito — é a fronteira que impede
 * segredo de vazar para o bundle.
 */

/**
 * Trata string vazia como ausente. A Vercel injeta `""` quando a variável
 * existe no projeto mas está em branco — sem isso o app quebraria no boot em
 * vez de cair no modo de demonstração.
 */
const optionalString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().min(1).optional(),
);

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  /** Força dados fictícios mesmo com credencial presente. */
  QYRA_FORCE_MOCK: z.enum(["true", "false"]).optional(),

  // ---- Meta (Ads + Instagram/Facebook orgânico) ----
  META_ACCESS_TOKEN: optionalString,
  META_AD_ACCOUNT_ID: optionalString,
  META_API_VERSION: z.string().default("v21.0"),
  META_IG_USER_ID: optionalString,
  META_PAGE_ID: optionalString,

  // ---- Google (Ads + GA4) — OAuth de app instalado ----
  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  GOOGLE_REFRESH_TOKEN: optionalString,

  GOOGLE_ADS_DEVELOPER_TOKEN: optionalString,
  GOOGLE_ADS_CUSTOMER_ID: optionalString,
  GOOGLE_ADS_LOGIN_CUSTOMER_ID: optionalString,
  GOOGLE_ADS_API_VERSION: z.string().default("v18"),

  GA4_PROPERTY_ID: optionalString,

  /** Janela e teto do rate limit das rotas de API. */
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),

  /** TTL do cache em memória dos relatórios, em segundos. */
  REPORT_CACHE_TTL: z.coerce.number().int().nonnegative().default(300),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  // Configuração malformada é erro de operação, não de runtime: falha cedo.
  throw new Error(
    `Variáveis de ambiente inválidas:\n${parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n")}`,
  );
}

export const env = parsed.data;

export const forceMock = env.QYRA_FORCE_MOCK === "true";

export const credentials = {
  metaAds: Boolean(env.META_ACCESS_TOKEN && env.META_AD_ACCOUNT_ID),
  metaOrganic: Boolean(env.META_ACCESS_TOKEN && (env.META_IG_USER_ID || env.META_PAGE_ID)),
  google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REFRESH_TOKEN),
  googleAds: Boolean(
    env.GOOGLE_CLIENT_ID &&
      env.GOOGLE_CLIENT_SECRET &&
      env.GOOGLE_REFRESH_TOKEN &&
      env.GOOGLE_ADS_DEVELOPER_TOKEN &&
      env.GOOGLE_ADS_CUSTOMER_ID,
  ),
  ga4: Boolean(
    env.GOOGLE_CLIENT_ID &&
      env.GOOGLE_CLIENT_SECRET &&
      env.GOOGLE_REFRESH_TOKEN &&
      env.GA4_PROPERTY_ID,
  ),
} as const;
