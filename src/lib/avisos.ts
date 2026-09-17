import type { Notice } from "./types";

/**
 * Aviso que ajuda a ler o relatório: por que um canal está fora do
 * consolidado, por que um número não pode ser comparado. Vai para a tela.
 *
 * **Texto novo aqui precisa de aprovação de quem opera o painel.** A tela é
 * lida pelo cliente, e o que aparece nela é decisão de quem apresenta — não do
 * conector. Um aviso explicando limitação de API foi publicado sem passar por
 * essa porta e teve de ser removido depois de já estar no ar.
 *
 * Limitação técnica se registra em comentário e em `docs/integracoes.md`. Só
 * vira aviso na tela quando alguém pedir.
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
