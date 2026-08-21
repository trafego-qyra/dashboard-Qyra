import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Sessão do painel.
 *
 * É a peça que decide quem vê o faturamento da empresa. Cada teste aqui existe
 * por causa de uma forma conhecida de furar esse tipo de porta.
 */

async function sessao() {
  return import("@/server/auth/sessao");
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.stubEnv("QYRA_SENHA", "abre-te-sesamo");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("senha", () => {
  it("aceita a senha configurada", async () => {
    const { senhaConfere } = await sessao();
    expect(senhaConfere("abre-te-sesamo")).toBe(true);
  });

  it("recusa senha errada, vazia ou parcial", async () => {
    const { senhaConfere } = await sessao();
    for (const chute of ["", "abre", "abre-te-sesam", "ABRE-TE-SESAMO", "outra"]) {
      expect(senhaConfere(chute)).toBe(false);
    }
  });

  it("tolera espaço colado no valor do ambiente", async () => {
    vi.stubEnv("QYRA_SENHA", "  abre-te-sesamo\n");
    vi.resetModules();

    // Colar no painel da Vercel arrasta espaço e quebra de linha com
    // facilidade, e a senha certa passaria a ser recusada sem pista do motivo.
    const { senhaConfere } = await sessao();
    expect(senhaConfere("abre-te-sesamo")).toBe(true);
  });

  it("sem senha configurada, nada é aceito", async () => {
    vi.stubEnv("QYRA_SENHA", "");
    vi.resetModules();

    const { senhaConfere } = await sessao();
    expect(senhaConfere("")).toBe(false);
    expect(senhaConfere("qualquer")).toBe(false);
  });
});

describe("token da sessão", () => {
  it("o token criado é aceito", async () => {
    const { criarToken, tokenValido } = await sessao();
    const token = await criarToken();

    expect(token).toBeTruthy();
    expect(await tokenValido(token as string)).toBe(true);
  });

  it("não carrega a senha dentro dele", async () => {
    const { criarToken } = await sessao();
    const token = (await criarToken()) as string;

    // Quem interceptar o cookie não pode extrair a senha dele.
    expect(token).not.toContain("abre-te-sesamo");
  });

  it("expira", async () => {
    const { criarToken, tokenValido, DURACAO_DA_SESSAO_MS } = await sessao();
    const agora = 1_000_000;
    const token = (await criarToken(agora)) as string;

    expect(await tokenValido(token, agora + DURACAO_DA_SESSAO_MS - 1)).toBe(true);
    expect(await tokenValido(token, agora + DURACAO_DA_SESSAO_MS + 1)).toBe(false);
  });

  it("recusa assinatura forjada, mesmo com data no futuro", async () => {
    const { tokenValido } = await sessao();
    const daquiAUmAno = Date.now() + 365 * 24 * 60 * 60 * 1000;

    expect(await tokenValido(`${daquiAUmAno}.assinatura-inventada`)).toBe(false);
  });

  it("recusa token com a data adulterada", async () => {
    const { criarToken, tokenValido, DURACAO_DA_SESSAO_MS } = await sessao();
    const agora = 1_000_000;
    const token = (await criarToken(agora)) as string;
    const assinatura = token.slice(token.indexOf(".") + 1);

    // A data entra na assinatura: esticar o prazo invalida o token.
    const esticado = `${agora + DURACAO_DA_SESSAO_MS * 10}.${assinatura}`;
    expect(await tokenValido(esticado, agora)).toBe(false);
  });

  it("recusa lixo, vazio e ausente", async () => {
    const { tokenValido } = await sessao();
    for (const valor of [undefined, "", ".", "sem-ponto", ".soassinatura", "abc.def"]) {
      expect(await tokenValido(valor)).toBe(false);
    }
  });

  it("token assinado com outra senha não vale", async () => {
    const { criarToken } = await sessao();
    const token = (await criarToken()) as string;

    // Trocar a senha derruba as sessões em aberto — que é o que se espera de
    // uma troca de senha.
    vi.stubEnv("QYRA_SENHA", "outra-senha");
    vi.resetModules();
    const { tokenValido } = await sessao();

    expect(await tokenValido(token)).toBe(false);
  });

  it("sem senha nem segredo, não cria nem aceita token", async () => {
    vi.stubEnv("QYRA_SENHA", "");
    vi.resetModules();

    const { criarToken, tokenValido } = await sessao();
    expect(await criarToken()).toBeNull();
    expect(await tokenValido("qualquer.coisa")).toBe(false);
  });

  it("um segredo próprio desacopla a sessão da senha", async () => {
    vi.stubEnv("QYRA_SESSAO_SECRET", "segredo-separado");
    vi.resetModules();
    const { criarToken } = await sessao();
    const token = (await criarToken()) as string;

    // Com segredo próprio, trocar a senha não desloga ninguém.
    vi.stubEnv("QYRA_SENHA", "senha-nova");
    vi.resetModules();
    const { tokenValido } = await sessao();

    expect(await tokenValido(token)).toBe(true);
  });
});
