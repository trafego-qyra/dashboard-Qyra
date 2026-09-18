import "server-only";

import type { Kpi, TableBlock } from "@/lib/types";
import { getCredentials } from "@/server/env";
import { type ResumoDaFila, resumo } from "@/server/fila/eventos-crm";

/**
 * O placar da atribuição, na tela de Vendas.
 *
 * Responde a pergunta que a integração inteira existe para responder, e que
 * nenhum relatório da Meta responde: **quanto do que o CRM sabe chega até
 * lá**. A Meta mostra as conversões que recebeu; ela não tem como mostrar as
 * que nunca chegaram.
 *
 * Mora em `server/` e devolve KPI e tabela já prontos — as duas formas que a
 * tela de canal já sabe desenhar. Componente novo aqui seria inventar layout
 * para um dado que cabe no que existe.
 */

/** Como cada estado da fila aparece para quem lê o relatório. */
const ROTULOS: Record<keyof ResumoDaFila, string> = {
  enviado: "Chegou na Meta",
  pendente: "Na fila, ainda não enviado",
  sem_identificador: "Sem como identificar",
  falhou: "Falhou no envio",
};

export interface Placar {
  kpi: Kpi;
  tabela: TableBlock;
}

/**
 * O placar, ou `null` quando não há o que mostrar.
 *
 * `null` sem banco configurado e `null` com a fila vazia. Uma tabela de zeros
 * na tela de Vendas sugere que a integração está falhando, quando o certo é
 * que ela ainda não começou — e o relatório de vendas é lido por quem não
 * acompanha o encanamento.
 */
export async function montarPlacar(): Promise<Placar | null> {
  if (!getCredentials().banco) return null;

  let fila: ResumoDaFila;
  try {
    fila = await resumo();
  } catch {
    // O placar é enfeite do relatório de Vendas: o banco fora do ar não pode
    // derrubar a receita da tela.
    return null;
  }

  const total = Object.values(fila).reduce((a, b) => a + b, 0);
  if (total === 0) return null;

  // Quem tinha como ser identificado, sobre o total. É o teto da atribuição:
  // nenhum ajuste de campanha melhora o que nunca teve telefone nem clique.
  const identificaveis = total - fila.sem_identificador;

  return {
    kpi: {
      key: "atribuicao",
      label: "Atribuição na Meta",
      value: identificaveis / total,
      format: "percent",
      semComparacao: true,
      hint: `De ${total} mudança(s) de etapa no período, ${identificaveis} tinham telefone, e-mail ou identificador de clique — só essas a Meta consegue casar com um anúncio. O resto entrou por conversa, sem deixar contato.`,
    },
    tabela: {
      title: "Atribuição na Meta",
      description:
        "O que o CRM registrou e o que a Meta conseguiu receber. A Meta mostra as conversões que chegaram; ela não tem como mostrar as que não chegaram.",
      columns: [
        { key: "estado", label: "Estado", align: "left" },
        { key: "eventos", label: "Eventos", format: "integer", align: "right" },
      ],
      rows: (Object.keys(ROTULOS) as Array<keyof ResumoDaFila>)
        .filter((estado) => fila[estado] > 0)
        .map((estado) => ({ estado: ROTULOS[estado], eventos: fila[estado] })),
    },
  };
}
