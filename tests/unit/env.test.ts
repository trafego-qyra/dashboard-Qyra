import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Normalização do ambiente.
 *
 * Um caractere invisível colado junto do segredo produz, na Graph API,
 * `code 190 — Cannot parse access token`: erro que parece credencial inválida
 * e não é. O teste existe para que isso não volte.
 */

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function carregarEnv() {
  vi.resetModules();
  return import("@/server/env");
}

describe("getEnv", () => {
  it("apara quebra de linha e espaço das credenciais", async () => {
    vi.stubEnv("META_ACCESS_TOKEN", "EAAGtoken123\n");
    vi.stubEnv("META_AD_ACCOUNT_ID", "  act_999  ");

    const { getEnv } = await carregarEnv();
    const env = getEnv();

    expect(env.META_ACCESS_TOKEN).toBe("EAAGtoken123");
    expect(env.META_AD_ACCOUNT_ID).toBe("act_999");
  });

  it("trata valor só com espaço como ausente", async () => {
    vi.stubEnv("META_ACCESS_TOKEN", "   \n  ");

    const { getEnv } = await carregarEnv();
    expect(getEnv().META_ACCESS_TOKEN).toBeUndefined();
  });

  it("apara também os valores que têm padrão", async () => {
    vi.stubEnv("META_API_VERSION", " v22.0\n");

    const { getEnv } = await carregarEnv();
    expect(getEnv().META_API_VERSION).toBe("v22.0");
  });

  it("mantém o padrão quando a variável vem vazia", async () => {
    vi.stubEnv("META_API_VERSION", "  ");

    const { getEnv } = await carregarEnv();
    expect(getEnv().META_API_VERSION).toBe("v21.0");
  });

  it("lê o ambiente a cada chamada, nunca congela na carga do módulo", async () => {
    const { getEnv } = await carregarEnv();
    expect(getEnv().META_AD_ACCOUNT_ID).toBeUndefined();

    // A Vercel não expõe variável sensível durante o build; congelar aqui faria
    // a aplicação subir achando que não há credencial.
    vi.stubEnv("META_AD_ACCOUNT_ID", "act_777");
    expect(getEnv().META_AD_ACCOUNT_ID).toBe("act_777");
  });
});

describe("getCredentials", () => {
  it("reconhece o Meta Ads com token e conta aparados", async () => {
    vi.stubEnv("QYRA_FORCE_MOCK", "false");
    vi.stubEnv("META_ACCESS_TOKEN", "EAAGtoken123\n");
    vi.stubEnv("META_AD_ACCOUNT_ID", "act_999 ");

    const { getCredentials } = await carregarEnv();
    expect(getCredentials().metaAds).toBe(true);
  });

  it("exige o par completo — token sozinho não basta", async () => {
    vi.stubEnv("META_ACCESS_TOKEN", "EAAGtoken123");

    const { getCredentials } = await carregarEnv();
    expect(getCredentials().metaAds).toBe(false);
  });

  it("Google Ads depende do OAuth completo, não só do developer token", async () => {
    vi.stubEnv("GOOGLE_ADS_DEVELOPER_TOKEN", "dev");
    vi.stubEnv("GOOGLE_ADS_CUSTOMER_ID", "123");

    const { getCredentials } = await carregarEnv();
    expect(getCredentials().googleAds).toBe(false);
  });
});
