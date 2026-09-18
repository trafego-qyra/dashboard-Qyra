import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { conferirCaptura } from "@/server/kommo/captura";

/**
 * Quanto dos negócios recentes chega com identificador de clique.
 *
 * Mede a **causa** do que o placar da tela de Vendas mostra como resultado. Sem
 * isto, saber se a captura da landing page funcionou exigiria abrir negócios um
 * a um no Kommo procurando o campo.
 */

function comCampos(...campos: Array<{ nome: string; valor?: string }>) {
  return {
    id: Math.random(),
    custom_fields_values: campos.map((c) => ({
      field_name: c.nome,
      values: [{ value: c.valor ?? "x" }],
    })),
  };
}

function kommo(leads: unknown[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ _embedded: { leads } }), { status: 200 })),
  );
}

beforeEach(() => {
  vi.stubEnv("KOMMO_SUBDOMAIN", "qyra");
  vi.stubEnv("KOMMO_ACCESS_TOKEN", "chave");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("conferirCaptura", () => {
  it("conta quantos negócios trazem cada coisa", async () => {
    kommo([
      comCampos({ nome: "fbc" }, { nome: "fbp" }, { nome: "utm_source" }),
      comCampos({ nome: "fbc" }),
      comCampos({ nome: "utm_source" }),
      comCampos({ nome: "PHONE" }),
    ]);

    const captura = await conferirCaptura();
    expect(captura).toMatchObject({
      amostra: 4,
      comClique: 2,
      comNavegador: 1,
      comUtm: 2,
    });
  });

  it("aceita as grafias que o formulário pode ter usado", async () => {
    // `_fbc` e `fbclid` são a mesma informação com nome diferente; quem monta o
    // formulário escolhe, e o conector não pode exigir uma delas.
    kommo([
      comCampos({ nome: "_fbc" }),
      comCampos({ nome: "fbclid" }),
      comCampos({ nome: "_fbp" }),
    ]);

    const captura = await conferirCaptura();
    expect(captura.comClique).toBe(2);
    expect(captura.comNavegador).toBe(1);
  });

  it("lista os campos vistos, que é o que expõe a grafia errada", async () => {
    // O erro mais chato desta configuração: o formulário grava em
    // `fb_click_id`, o conector procura `fbc`, e os dois lados parecem certos
    // enquanto nada funciona.
    kommo([comCampos({ nome: "fb_click_id" }, { nome: "PHONE" })]);

    const captura = await conferirCaptura();
    expect(captura.comClique).toBe(0);
    expect(captura.camposVistos).toEqual(["PHONE", "fb_click_id"]);
  });

  it("campo presente mas vazio não conta como capturado", async () => {
    kommo([comCampos({ nome: "fbc", valor: "" })]);
    await expect(conferirCaptura()).resolves.toMatchObject({ amostra: 1, comClique: 0 });
  });

  it("conta vazia devolve zeros, não erro", async () => {
    kommo([]);
    await expect(conferirCaptura()).resolves.toMatchObject({ amostra: 0, comClique: 0 });
  });
});
