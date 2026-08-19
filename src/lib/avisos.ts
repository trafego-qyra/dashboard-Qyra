import type { Notice } from "./types";

/**
 * Aviso que ajuda a ler o relatório: por que um canal está fora do
 * consolidado, por que o filtro de data não move um período fixo. Vai para a
 * tela.
 */
export function avisoCliente(text: string): Notice {
  return { text, audience: "cliente" };
}

/**
 * Encanamento: nome de variável de ambiente, instrução de token, detalhe de
 * erro da API.
 *
 * Não vai para a tela. Numa reunião com o cliente, uma pilha de avisos
 * pedindo para "solicitar acesso básico na Central de API" só mostra que a
 * casa não está em ordem — e quem precisa dessa informação abre
 * `/api/health` ou `/api/diagnostico/*`, onde ela continua.
 */
export function avisoOperacao(text: string): Notice {
  return { text, audience: "operacao" };
}

/** O que a tela mostra. */
export function avisosVisiveis(notices: Notice[]): Notice[] {
  return notices.filter((n) => n.audience === "cliente");
}
