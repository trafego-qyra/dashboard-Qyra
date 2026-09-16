import { describe, expect, it } from "vitest";

import {
  extrairFbclid,
  montarFbc,
  normalizarEmail,
  normalizarNome,
  normalizarTelefone,
} from "@/lib/identidade";

/**
 * Identificadores enviados à Meta na API de Conversões.
 *
 * O que torna este módulo traiçoeiro: **errar aqui não quebra nada**. A Meta
 * aceita o evento, responde 200, e a pessoa só não é encontrada. O sintoma é
 * uma taxa de correspondência baixa semanas depois, sem nenhuma pista de onde
 * ela nasceu. Por isso cada caso abaixo é um formato que chega de verdade no
 * campo do CRM, não uma variação inventada.
 */

describe("normalizarTelefone", () => {
  it("põe o país no número brasileiro salvo sem ele", () => {
    // O formato que a recepção digita. Sem o 55 na frente, hash diferente.
    expect(normalizarTelefone("(11) 99999-9999")).toBe("5511999999999");
  });

  it("aceita o número que já vem completo do WhatsApp", () => {
    expect(normalizarTelefone("5511999999999")).toBe("5511999999999");
    expect(normalizarTelefone("+55 11 99999-9999")).toBe("5511999999999");
  });

  it("descarta o 0 de operadora e o 00 de discagem internacional", () => {
    // Os dois entram junto quando o número é copiado de uma agenda, e nenhum
    // dos dois faz parte do E.164.
    expect(normalizarTelefone("011 99999-9999")).toBe("5511999999999");
    expect(normalizarTelefone("005511999999999")).toBe("5511999999999");
  });

  it("aceita fixo de oito dígitos com DDD", () => {
    expect(normalizarTelefone("11 3333-4444")).toBe("551133334444");
  });

  it("não inventa DDD quando ele não veio", () => {
    // Chutar um DDD produz hash errado — pior que não mandar, porque conta
    // como evento sem correspondência e derruba a qualidade do conjunto.
    expect(normalizarTelefone("99999-9999")).toBeNull();
    expect(normalizarTelefone("1234")).toBeNull();
  });

  it("não reescreve para o Brasil o número que já traz outro país", () => {
    // Portugal: 351 + 9 dígitos. De 12 dígitos para cima o país já está lá.
    expect(normalizarTelefone("+351 912 345 678")).toBe("351912345678");
  });

  it("trata 11 dígitos como celular brasileiro, e isso é uma escolha", () => {
    // 11 dígitos é ambíguo: DDD + celular daqui, ou 1 + número dos EUA. Numa
    // clínica brasileira o primeiro caso é a regra e o segundo é a exceção,
    // então o desempate é por lá. Número dos EUA só sai certo se vier com o
    // país escrito de forma inequívoca — e aí ele tem 11 dígitos também, o que
    // este teste registra como limitação conhecida, não como acerto.
    expect(normalizarTelefone("+1 415 555 2671")).toBe("5514155552671");
  });

  it("recusa o campo com duas coisas coladas", () => {
    expect(normalizarTelefone("5511999999999 / 5511888888888")).toBeNull();
  });

  it("trata vazio e ausente como ausente", () => {
    expect(normalizarTelefone("")).toBeNull();
    expect(normalizarTelefone(null)).toBeNull();
    expect(normalizarTelefone(undefined)).toBeNull();
  });
});

describe("normalizarEmail", () => {
  it("apara e derruba a caixa", () => {
    expect(normalizarEmail("  Maria@Gmail.COM ")).toBe("maria@gmail.com");
  });

  it("recusa o que não tem cara de e-mail", () => {
    expect(normalizarEmail("nao tem email")).toBeNull();
    expect(normalizarEmail("maria@")).toBeNull();
    expect(normalizarEmail("@gmail.com")).toBeNull();
    expect(normalizarEmail("maria@gmail")).toBeNull();
  });
});

describe("normalizarNome", () => {
  it("remove acento, que é o erro mais caro numa base brasileira", () => {
    expect(normalizarNome("André")).toBe("andre");
    expect(normalizarNome("Conceição")).toBe("conceicao");
  });

  it("descarta pontuação e espaço", () => {
    expect(normalizarNome("  Ana Júlia  ")).toBe("anajulia");
    expect(normalizarNome("O'Brien")).toBe("obrien");
  });

  it("devolve nulo quando não sobra letra nenhuma", () => {
    expect(normalizarNome("---")).toBeNull();
    expect(normalizarNome("")).toBeNull();
  });
});

describe("extrairFbclid", () => {
  it("aceita o parâmetro cru", () => {
    expect(extrairFbclid("IwAR1abcDEF_xyz-123")).toBe("IwAR1abcDEF_xyz-123");
  });

  it("acha o parâmetro dentro da URL colada inteira no campo", () => {
    expect(
      extrairFbclid("https://qyra.com.br/questionario?utm_source=fb&fbclid=IwAR1abc#topo"),
    ).toBe("IwAR1abc");
  });

  it("tira o parâmetro de dentro do cookie completo", () => {
    expect(extrairFbclid("fb.1.1758000000000.IwAR1abc")).toBe("IwAR1abc");
  });

  it("preserva o ponto que faz parte do próprio fbclid", () => {
    // O `fbclid` pode conter ponto: só os três primeiros são do formato.
    expect(extrairFbclid("fb.1.1758000000000.IwAR1.abc.def")).toBe("IwAR1.abc.def");
  });

  it("recusa texto que alguém digitou no campo errado", () => {
    expect(extrairFbclid("veio pelo instagram")).toBeNull();
    expect(extrairFbclid("  ")).toBeNull();
    expect(extrairFbclid(null)).toBeNull();
  });
});

describe("montarFbc", () => {
  const CRIADO_EM = 1_758_000_000_000;

  it("deixa o cookie completo passar intacto", () => {
    // O timestamp de dentro dele é o do clique de verdade — melhor do que
    // qualquer reconstrução a partir da data do negócio.
    const cookie = "fb.1.1750000000000.IwAR1abc";
    expect(montarFbc(cookie, CRIADO_EM)).toBe(cookie);
  });

  it("monta o cookie quando só o fbclid foi gravado", () => {
    expect(montarFbc("IwAR1abc", CRIADO_EM)).toBe("fb.1.1758000000000.IwAR1abc");
  });

  it("devolve nulo sem clique — é o caso do lead de DM", () => {
    expect(montarFbc(null, CRIADO_EM)).toBeNull();
    expect(montarFbc("veio pelo instagram", CRIADO_EM)).toBeNull();
  });

  it("devolve nulo quando a data do negócio não veio", () => {
    // Sem instante não há cookie válido, e `fb.1.0.…` seria descartado
    // silenciosamente do outro lado.
    expect(montarFbc("IwAR1abc", 0)).toBeNull();
    expect(montarFbc("IwAR1abc", Number.NaN)).toBeNull();
  });
});
