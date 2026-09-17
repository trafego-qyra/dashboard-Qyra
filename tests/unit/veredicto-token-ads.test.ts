import { describe, expect, it } from "vitest";

import { veredictoDoToken } from "@/server/diagnostico/veredicto-ads";

/**
 * O veredicto do token de desenvolvedor.
 *
 * É a linha que decide se o Google Ads está em tempo real ou preso no snapshot
 * exportado, e quem espera a aprovação do Google recarrega essa página várias
 * vezes por dia. Errar aqui manda alguém abrir chamado com o suporte do Google
 * por um problema que é outro — ou pior, faz parar de olhar quando já liberou.
 */

const etapa = (parcial: Partial<{ etapa: string; ok: boolean; resultado: string }>) => ({
  etapa: "ads-consulta",
  descricao: "",
  status: 200,
  ok: true,
  resultado: "",
  ...parcial,
});

describe("veredictoDoToken", () => {
  it("reconhece o token ainda em acesso de teste", () => {
    const veredicto = veredictoDoToken([
      etapa({
        etapa: "ads-acesso",
        ok: false,
        resultado:
          '{"error":{"details":[{"errors":[{"errorCode":{"authorizationError":"DEVELOPER_TOKEN_NOT_APPROVED"}}]}]}}',
      }),
    ]);

    expect(veredicto.situacao).toBe("acesso de teste");
    // Quem lê precisa saber que não há nada a fazer no painel — e que a tela
    // vira sozinha quando o Google liberar.
    expect(veredicto.explicacao).toMatch(/snapshot/i);
  });

  it("trata token proibido como o mesmo estado de espera", () => {
    const veredicto = veredictoDoToken([
      etapa({ etapa: "ads-versao", ok: false, resultado: "DEVELOPER_TOKEN_PROHIBITED" }),
    ]);

    expect(veredicto.situacao).toBe("acesso de teste");
  });

  it("consulta aceita é a prova de que foi aprovado", () => {
    const veredicto = veredictoDoToken([
      etapa({ etapa: "ads-acesso", resultado: "2 conta(s)." }),
      etapa({ etapa: "ads-consulta", resultado: "7 dia(s) com dado." }),
    ]);

    expect(veredicto.situacao).toBe("aprovado");
  });

  it("período sem entrega continua sendo aprovação", () => {
    const veredicto = veredictoDoToken([
      etapa({ etapa: "ads-consulta", resultado: "Consulta aceita, mas sem linhas." }),
    ]);

    // Zero linhas é resposta da conta real. Ler isso como "não aprovado" faria
    // alguém abrir chamado por causa de uma semana sem investimento.
    expect(veredicto.situacao).toBe("aprovado");
  });

  it("outra falha não vira problema de token", () => {
    const veredicto = veredictoDoToken([
      etapa({ etapa: "ads-consulta", ok: false, resultado: "USER_PERMISSION_DENIED" }),
    ]);

    expect(veredicto.situacao).toBe("indeterminado");
    expect(veredicto.explicacao).toMatch(/não é o nível de acesso/i);
  });

  it("consulta aceita numa etapa não apaga o acesso de teste declarado em outra", () => {
    const veredicto = veredictoDoToken([
      // `listAccessibleCustomers` responde 200 com token de teste. Foi
      // exatamente essa etapa que, lida sozinha, fez concluir que o token
      // estava aprovado quando não estava.
      etapa({ etapa: "ads-acesso", resultado: "1 conta(s) acessível(is): 7062904143." }),
      etapa({ etapa: "ads-consulta", ok: false, resultado: "USER_PERMISSION_DENIED" }),
      etapa({
        etapa: "ads-consulta-sem-gerente",
        ok: false,
        resultado: "DEVELOPER_TOKEN_NOT_APPROVED",
      }),
    ]);

    expect(veredicto.situacao).toBe("acesso de teste");
  });

  it("sem nenhuma tentativa ao Ads, diz que falta configuração", () => {
    const veredicto = veredictoDoToken([etapa({ etapa: "oauth" }), etapa({ etapa: "ga4" })]);

    expect(veredicto.situacao).toBe("não configurado");
  });
});
