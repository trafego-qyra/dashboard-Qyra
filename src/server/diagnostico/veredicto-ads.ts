import "server-only";

/**
 * Leitura do diagnóstico do Google, separada da rota.
 *
 * Um Route Handler do Next só pode exportar os verbos HTTP e a configuração da
 * rota — qualquer outro `export` reprova na checagem de tipos do build. A regra
 * é chata, mas puxa a lógica para onde ela é testável sem subir um servidor, que
 * é onde ela deveria estar de qualquer jeito.
 */

/** Um degrau da cadeia de credenciais, como a rota o registra. */
export interface Etapa {
  etapa: string;
  descricao: string;
  status: number | null;
  ok: boolean;
  resultado: string;
}

/**
 * O token de desenvolvedor já saiu do acesso de teste?
 *
 * Um token recém-criado lê apenas contas de teste: qualquer consulta à conta
 * real volta com `DEVELOPER_TOKEN_NOT_APPROVED`. É um estado esperado, não um
 * erro de configuração — e é o único degrau entre o Google Ads em snapshot e o
 * Google Ads em tempo real. Quem espera a aprovação abre esta página várias
 * vezes por dia; a resposta merece uma linha própria.
 */
export function veredictoDoToken(etapas: Etapa[]): {
  situacao: "aprovado" | "acesso de teste" | "não configurado" | "indeterminado";
  explicacao: string;
} {
  const doAds = etapas.filter((e) => e.etapa.startsWith("ads"));
  if (doAds.length === 0) {
    return {
      situacao: "não configurado",
      explicacao:
        "Nenhuma consulta ao Google Ads foi tentada — falta credencial antes deste degrau.",
    };
  }

  if (
    doAds.some((e) => /DEVELOPER_TOKEN_NOT_APPROVED|DEVELOPER_TOKEN_PROHIBITED/i.test(e.resultado))
  ) {
    return {
      situacao: "acesso de teste",
      explicacao:
        "O Google ainda não liberou o acesso básico. Enquanto isso o painel mostra o snapshot exportado da plataforma. O token não muda quando for aprovado — só o nível de acesso, e a tela vira tempo real sozinha no próximo carregamento.",
    };
  }

  // Consulta aceita é a única prova de aprovação. Um período sem entrega
  // devolve zero linhas, e zero linhas continua sendo consulta aceita.
  if (doAds.some((e) => e.etapa === "ads-consulta" && e.ok)) {
    return {
      situacao: "aprovado",
      explicacao: "A conta real respondeu. O Google Ads está lendo em tempo real.",
    };
  }

  return {
    situacao: "indeterminado",
    explicacao:
      "A consulta ao Google Ads falhou por outro motivo — veja a etapa que quebrou. Não é o nível de acesso do token.",
  };
}
