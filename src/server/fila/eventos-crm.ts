import "server-only";

import {
  type DadosDoUsuario,
  type EventoDeCrm,
  type EventoPreparado,
  enviarPreparados,
  montarUsuario,
} from "@/server/connectors/meta-capi";
import { descreverFalha } from "@/server/lib/http";
import { atualizar, contar, excluir, inserir, selecionar } from "@/server/lib/supabase";

/**
 * Fila dos eventos de CRM que vão para a Meta.
 *
 * Existe por três razões que nenhum cache em memória resolve:
 *
 * 1. **Idempotência.** O Kommo reenvia webhook. A Meta deduplica por
 *    `event_id`, mas só se o mesmo id for mandado de novo — e para isso alguém
 *    precisa lembrar qual id foi gerado para aquele negócio naquela etapa.
 * 2. **Retentativa durável.** Graph API fora do ar às três da manhã não pode
 *    matar o evento. Instância da Vercel é reciclada; a linha no banco não.
 * 3. **Auditoria.** Quando a Meta não mostrar a venda, a primeira pergunta é
 *    "a gente mandou?". Sem registro do que saiu e do que voltou, não há
 *    depuração possível — só suposição.
 *
 * **O que fica guardado já está hasheado.** `montarUsuario` roda na entrada, e
 * o que a tabela recebe é `user_data` — SHA-256 de telefone e e-mail, nunca o
 * valor legível. Reenviar não precisa do dado cru, então ele não precisa
 * existir aqui. É o que mantém `docs/seguranca.md` honesto: o painel passa a
 * ter banco, mas não passa a guardar contato de paciente.
 */

const TABELA = "evento_crm";

/** Acima disso, insistir só gasta requisição: o problema não é passageiro. */
const MAX_TENTATIVAS = 5;

/** Teto por rodada de despacho, para uma execução não estourar o tempo da função. */
const POR_RODADA = 200;

/**
 * Por quanto tempo um evento fica guardado.
 *
 * Noventa dias não é número redondo escolhido por estética: passa da janela em
 * que a Meta ainda atribui qualquer coisa, e passa do prazo em que a operação
 * ainda vai querer conferir se uma venda saiu. Guardar além disso só aumenta o
 * estrago de um vazamento, e é o que o achado S9 de docs/seguranca.md cobra.
 */
const DIAS_ATE_O_EXPURGO = 90;

type StatusDaFila = "pendente" | "enviado" | "sem_identificador" | "falhou";

/** Uma linha da tabela, na forma em que o PostgREST devolve. */
interface LinhaDaFila {
  event_id: string;
  event_name: string;
  /** `timestamptz` em ISO — a Meta quer unix em segundos, convertido no despacho. */
  event_time: string;
  user_data: DadosDoUsuario;
  valor: number | null;
  moeda: string | null;
  tentativas: number;
}

export interface ResultadoDoEnfileiramento {
  enfileirados: number;
  /** Sem telefone, e-mail, clique nem `lead_id`: entra registrado, não enviável. */
  semIdentificador: number;
}

/**
 * Grava os eventos, já hasheados.
 *
 * Quem não tem identificador entra como `sem_identificador` em vez de ser
 * descartado. É de propósito: esse número é a resposta para "quanto do funil a
 * Meta não consegue enxergar", e some se a linha não existir. É ele que vai
 * dizer se vale investir em capturar origem na conversa de WhatsApp.
 */
export async function enfileirar(
  eventos: EventoDeCrm[],
  kommoLeadId?: (evento: EventoDeCrm) => number | null,
): Promise<ResultadoDoEnfileiramento> {
  const linhas = eventos.map((evento) => {
    const usuario = montarUsuario(evento.identidade);
    return {
      event_id: evento.eventId,
      kommo_lead_id: kommoLeadId?.(evento) ?? null,
      event_name: evento.eventName,
      event_time: new Date(evento.eventTime * 1_000).toISOString(),
      // Coluna `not null`: sem identificador vai objeto vazio, e o status é
      // quem carrega a informação de que não dá para enviar.
      user_data: usuario ?? {},
      valor: typeof evento.valor === "number" && evento.valor > 0 ? evento.valor : null,
      moeda: evento.moeda ?? "BRL",
      status: (usuario ? "pendente" : "sem_identificador") satisfies StatusDaFila,
    };
  });

  await inserir(TABELA, linhas);

  return {
    enfileirados: linhas.filter((l) => l.status === "pendente").length,
    semIdentificador: linhas.filter((l) => l.status === "sem_identificador").length,
  };
}

export interface ResultadoDoDespacho {
  tentados: number;
  recebidos: number;
  falhou: boolean;
  detalhe?: string;
}

/**
 * Manda para a Meta o que está pendente.
 *
 * **Sem trava de concorrência, de propósito.** Duas execuções simultâneas
 * pegariam as mesmas linhas e mandariam o mesmo `event_id` duas vezes — que é
 * exatamente o caso que a deduplicação da Meta cobre. Um `SELECT ... FOR UPDATE
 * SKIP LOCKED` resolveria de forma mais elegante e custaria uma conexão direta
 * ao Postgres em ambiente sem estado, para proteger de um problema que não
 * causa dano. Quando o volume justificar, troque — e escreva por quê.
 */
export async function despachar(limite = POR_RODADA): Promise<ResultadoDoDespacho> {
  const linhas = await selecionar<LinhaDaFila>(TABELA, {
    status: "eq.pendente",
    tentativas: `lt.${MAX_TENTATIVAS}`,
    order: "event_time.asc",
    limit: String(limite),
    select: "event_id,event_name,event_time,user_data,valor,moeda,tentativas",
  });

  if (linhas.length === 0) return { tentados: 0, recebidos: 0, falhou: false };

  const preparados: EventoPreparado[] = linhas.map((linha) => ({
    eventId: linha.event_id,
    eventName: linha.event_name,
    eventTime: Math.floor(Date.parse(linha.event_time) / 1_000),
    usuario: linha.user_data,
    valor: linha.valor,
    moeda: linha.moeda ?? "BRL",
  }));

  const ids = linhas.map((l) => l.event_id);
  const filtro = { event_id: `in.(${ids.map((id) => `"${id}"`).join(",")})` };

  try {
    const resultado = await enviarPreparados(preparados);

    await atualizar(TABELA, filtro, {
      status: "enviado" satisfies StatusDaFila,
      enviado_em: new Date().toISOString(),
      ultima_resposta: `recebidos: ${resultado.recebidos}; rastreio: ${resultado.rastreio.join(", ")}`,
    });

    return { tentados: linhas.length, recebidos: resultado.recebidos, falhou: false };
  } catch (erro) {
    const detalhe = descreverFalha(erro);

    // A contagem de tentativas sobe por linha, e quem estourou o teto sai da
    // fila como `falhou` — do contrário uma carga malformada seria reenviada
    // para sempre, gastando requisição e escondendo os eventos bons atrás dela.
    await Promise.all(
      linhas.map((linha) =>
        atualizar(
          TABELA,
          { event_id: `eq.${linha.event_id}` },
          {
            tentativas: linha.tentativas + 1,
            ultima_resposta: detalhe,
            ...(linha.tentativas + 1 >= MAX_TENTATIVAS
              ? { status: "falhou" satisfies StatusDaFila }
              : {}),
          },
        ),
      ),
    );

    return { tentados: linhas.length, recebidos: 0, falhou: true, detalhe };
  }
}

export type ResumoDaFila = Record<StatusDaFila, number>;

/**
 * Quantos eventos há em cada estado.
 *
 * É o que a tela de Vendas vai mostrar, e o que responde a pergunta que
 * importa: quanto do funil chega na Meta, e quanto fica invisível para ela.
 */
export async function resumo(): Promise<ResumoDaFila> {
  const estados: StatusDaFila[] = ["pendente", "enviado", "sem_identificador", "falhou"];
  const contagens = await Promise.all(
    estados.map((estado) => contar(TABELA, { status: `eq.${estado}` })),
  );

  return Object.fromEntries(estados.map((estado, i) => [estado, contagens[i]])) as ResumoDaFila;
}

/**
 * Apaga o que já passou da validade.
 *
 * Roda junto com a varredura diária porque é o único lugar que acontece todo
 * dia sem ninguém mandar. Apaga por data de criação, não por status: evento que
 * falhou cinco vezes há três meses também não serve mais a ninguém, e mantê-lo
 * só preserva hash de telefone que já deveria ter sumido.
 */
export async function expurgar(dias = DIAS_ATE_O_EXPURGO): Promise<number> {
  const corte = new Date(Date.now() - dias * 86_400_000).toISOString();
  const quantos = await contar(TABELA, { criado_em: `lt.${corte}` });

  if (quantos > 0) await excluir(TABELA, { criado_em: `lt.${corte}` });

  return quantos;
}
