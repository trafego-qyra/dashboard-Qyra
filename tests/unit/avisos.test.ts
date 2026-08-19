import { describe, expect, it } from "vitest";

import { avisoCliente, avisoOperacao, avisosVisiveis } from "@/lib/avisos";

describe("audiência dos avisos", () => {
  it("a tela só recebe o que é dirigido a quem lê o relatório", () => {
    const visiveis = avisosVisiveis([
      avisoOperacao("Modo mock forçado por QYRA_FORCE_MOCK."),
      avisoCliente("Este canal tem período próprio."),
      avisoOperacao("Solicite o acesso básico na Central de API."),
    ]);

    expect(visiveis.map((n) => n.text)).toEqual(["Este canal tem período próprio."]);
  });

  it("não deixa passar nome de variável nem instrução de token", () => {
    // Numa reunião com o cliente, uma pilha de avisos pedindo para configurar
    // token só mostra que a casa não está em ordem. O texto continua no
    // payload, para /api/health e /api/diagnostico/*.
    const encanamento = [
      "Modo mock forçado por QYRA_FORCE_MOCK.",
      "Sem credencial do Meta Ads — exibindo dados de demonstração.",
      "verifique a permissão instagram_manage_insights",
      "A API do Google Ads não respondeu. Detalhe técnico: 404 Not Found",
    ].map(avisoOperacao);

    expect(avisosVisiveis(encanamento)).toEqual([]);
  });

  it("preserva a ordem do que sobra", () => {
    const visiveis = avisosVisiveis([
      avisoCliente("primeiro"),
      avisoOperacao("descartado"),
      avisoCliente("segundo"),
    ]);

    expect(visiveis.map((n) => n.text)).toEqual(["primeiro", "segundo"]);
  });
});
