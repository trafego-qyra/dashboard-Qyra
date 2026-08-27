import "server-only";

import { z } from "zod";

/**
 * Configuração do lado servidor. Este módulo é `server-only`: importá-lo de um
 * componente cliente quebra o build de propósito — é a fronteira que impede
 * segredo de vazar para o bundle.
 *
 * **O ambiente é lido sob demanda, nunca no carregamento do módulo.** Módulo de
 * servidor é avaliado também durante o build, e variável marcada como sensível
 * na Vercel não existe nesse momento. Congelar o resultado ali faz a aplicação
 * subir achando que não há credencial — mesmo com tudo configurado.
 */

/**
 * Normaliza uma credencial vinda do ambiente.
 *
 * **Apara o valor.** Colar um segredo no painel da Vercel carrega quebra de
 * linha ou espaço com muita facilidade, e o caractere invisível viaja até a
 * query string da requisição: a Graph API responde
 * `code 190 — Cannot parse access token`, que parece token inválido e não é.
 *
 * **Trata string vazia como ausente.** A Vercel injeta `""` quando a variável
 * existe no projeto mas está em branco — sem isso o app quebraria no boot em
 * vez de cair no modo de demonstração.
 */
/**
 * Remove um prefixo `NOME_DA_VARIAVEL=` colado por engano junto do valor.
 *
 * Copiar do painel ou de documentação frequentemente arrasta o nome junto, e o
 * sintoma que isso produz na origem — `Cannot parse access token` — não tem
 * nenhuma relação aparente com a causa. Nenhuma credencial legítima começa com
 * um identificador em maiúsculas seguido de `=`, então a remoção é segura.
 */
function removerPrefixoDeNome(valor: string): string {
  return (
    valor
      // "META_ACCESS_TOKEN=EAAG..." — copiado de um arquivo .env
      .replace(/^[A-Z][A-Z0-9_]{2,}[ \t]*=[ \t]*/, "")
      // "META_ACCESS_TOKEN\nEAAG..." — copiado de um bloco com nome e valor em
      // linhas separadas. Nenhuma credencial usada aqui é multilinha, então uma
      // primeira linha que só contém um identificador em maiúsculas é ruído.
      .replace(/^[A-Z][A-Z0-9_]{2,}[ \t]*\r?\n\s*/, "")
  );
}

function normalizar(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const limpo = removerPrefixoDeNome(value.trim()).trim();
  return limpo === "" ? undefined : limpo;
}

const optionalString = z.preprocess(normalizar, z.string().min(1).optional());

/** Mesma normalização para os valores que têm padrão. */
const trimmedString = (fallback: string) => z.preprocess(normalizar, z.string().default(fallback));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  /** Força dados fictícios mesmo com credencial presente. */
  QYRA_FORCE_MOCK: z.enum(["true", "false"]).optional(),

  // ---- Meta (Ads + Instagram/Facebook orgânico) ----
  META_ACCESS_TOKEN: optionalString,
  META_AD_ACCOUNT_ID: optionalString,
  META_API_VERSION: trimmedString("v21.0"),
  META_IG_USER_ID: optionalString,
  META_PAGE_ID: optionalString,

  // ---- Google (Ads + GA4) — OAuth de app instalado ----
  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  GOOGLE_REFRESH_TOKEN: optionalString,

  GOOGLE_ADS_DEVELOPER_TOKEN: optionalString,
  GOOGLE_ADS_CUSTOMER_ID: optionalString,
  GOOGLE_ADS_LOGIN_CUSTOMER_ID: optionalString,
  // Sem padrão fixo de propósito: o Google aposenta uma versão por ano, e
  // uma constante no código vira 404 silencioso meses depois. Vazio faz o
  // conector descobrir a versão em uso; preenchido, ele obedece e não testa.
  GOOGLE_ADS_API_VERSION: optionalString,

  GA4_PROPERTY_ID: optionalString,

  // ID do projeto no Microsoft Clarity. Não é segredo — vai no script público
  // do site. Serve para o painel apontar para os mapas de calor: o GA4 diz
  // quanto tempo a pessoa ficou na página, o Clarity mostra até onde ela leu.
  CLARITY_PROJECT_ID: optionalString,
  // Token da API de exportação do Clarity. Esse é segredo, ao contrário do ID.
  CLARITY_API_TOKEN: optionalString,

  // ---- Kommo (CRM de vendas) ----
  /** O nome que aparece na URL da conta: `https://SUBDOMINIO.kommo.com`. */
  KOMMO_SUBDOMAIN: optionalString,
  /** Chave de longa duração da integração privada. */
  KOMMO_ACCESS_TOKEN: optionalString,
  /**
   * Funil de vendas, quando a conta tem mais de um.
   *
   * `142` é etapa de ganho em todo funil do Kommo: sem restringir, um pipeline
   * de suporte ou de pós-venda entra no faturamento junto.
   */
  KOMMO_PIPELINE_ID: optionalString,

  /** Janela e teto do rate limit das rotas de API. */
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),

  /** TTL do cache em memória dos relatórios, em segundos. */
  REPORT_CACHE_TTL: z.coerce.number().int().nonnegative().default(300),
});

export type Env = z.infer<typeof schema>;

/**
 * Lê e valida o ambiente **no momento da chamada**.
 *
 * Sem memoização: `process.env` é um objeto em memória, a validação custa
 * microssegundos, e guardar o resultado é exatamente o erro que este módulo
 * existe para não cometer.
 */
export function getEnv(): Env {
  const parsed = schema.safeParse(process.env);

  if (!parsed.success) {
    // Configuração malformada é erro de operação, não de runtime: falha cedo.
    throw new Error(
      `Variáveis de ambiente inválidas:\n${parsed.error.issues
        .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
        .join("\n")}`,
    );
  }

  return parsed.data;
}

export function isForceMock(): boolean {
  return getEnv().QYRA_FORCE_MOCK === "true";
}

export interface Credentials {
  metaAds: boolean;
  metaOrganic: boolean;
  google: boolean;
  googleAds: boolean;
  ga4: boolean;
  clarity: boolean;
  vendas: boolean;
}

/** Quais integrações têm credencial completa **agora**. */
export function getCredentials(): Credentials {
  const env = getEnv();

  const google = Boolean(
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REFRESH_TOKEN,
  );

  return {
    metaAds: Boolean(env.META_ACCESS_TOKEN && env.META_AD_ACCOUNT_ID),
    // O conector de orgânico consulta métricas exclusivas do Instagram
    // (`reach`, `follower_count`) na edge de Insights de conta do IG. Com
    // apenas a Página configurada, a Graph responde `(#100) metric[0] must be
    // a valid insights metric` — a tela quebrava em vez de cair em
    // demonstração. A Página serve para *descobrir* o ID do Instagram, não
    // para substituí-lo.
    metaOrganic: Boolean(env.META_ACCESS_TOKEN && env.META_IG_USER_ID),
    google,
    googleAds: Boolean(google && env.GOOGLE_ADS_DEVELOPER_TOKEN && env.GOOGLE_ADS_CUSTOMER_ID),
    ga4: Boolean(google && env.GA4_PROPERTY_ID),
    clarity: Boolean(env.CLARITY_API_TOKEN),
    // As duas juntas: o token sem o subdomínio não sabe para qual conta ir.
    vendas: Boolean(env.KOMMO_SUBDOMAIN && env.KOMMO_ACCESS_TOKEN),
  };
}
