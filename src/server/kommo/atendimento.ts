import "server-only";

import type { DateRange } from "@/lib/types";
import { autorizacao, baseDaApi } from "@/server/connectors/kommo";

/**
 * Quanto tempo o lead espera para ser atendido, numa janela de datas.
 *
 * O Kommo já mostra uma média — "73s" — e ela é a métrica errada. Média some
 * com o que importa: no mesmo painel em que ela aparece, há doze conversas sem
 * resposta e alguém esperando há trinta e três dias. Trinta e três dias e
 * setenta segundos convivem numa média sem que ninguém perceba o primeiro.
 *
 * Aqui a mediana é o dia normal, o p90 é o dia ruim, e quem **ainda não foi
 * respondido** aparece separado em vez de sumir — porque conversa sem resposta
 * nenhuma não tem tempo de resposta para entrar na conta, e é justamente ela
 * que custa venda.
 *
 * O recorte por hora existe por causa de um achado da varredura: 72% dos leads
 * entram entre 19h e 8h, quando não há ninguém atendendo. Se for verdade, ele
 * aparece aqui como uma faixa de espera longa de madrugada.
 */

/** Registros por página, e teto de páginas. O mesmo critério do conector. */
const POR_PAGINA = 250;
const MAX_PAGINAS = 8;

/** Fuso da clínica. Sem isso, "madrugada" seria a madrugada de Londres. */
const FUSO = "America/Sao_Paulo";

/**
 * Quanto se busca **além** do fim da janela, só para parear resposta.
 *
 * Uma mensagem que chega às 23h50 do último dia e é respondida às 8h do dia
 * seguinte foi respondida. Sem esta folga ela entraria como "sem resposta", e
 * o número pioraria na virada de todo mês por motivo nenhum.
 */
const FOLGA_EM_DIAS = 2;

/** Uma mensagem, reduzida ao que a conta precisa. */
interface Mensagem {
  /** O negócio a que ela pertence. É por ele que a conversa é agrupada. */
  entidade: string;
  /** Quando aconteceu, em milissegundos. */
  em: number;
  direcao: "entrada" | "saida";
  /** Quem respondeu. `null` na entrada, e no que o Kommo não atribui. */
  usuarioId: string | null;
}

interface EsperaPorUsuario {
  usuarioId: string;
  respostas: number;
  medianaSegundos: number;
}

interface EsperaPorHora {
  /** Hora local de 0 a 23, no fuso da clínica. */
  hora: number;
  entradas: number;
  medianaSegundos: number | null;
}

export interface Atendimento {
  periodo: DateRange;
  /** De onde os dados vieram. `null` quando nenhuma fonte respondeu. */
  fonte: "eventos" | "notas" | null;
  conversas: number;
  respondidas: number;
  /** Conversas com mensagem do lead e nenhuma resposta depois dela. */
  semResposta: number;
  medianaSegundos: number | null;
  p90Segundos: number | null;
  /** A maior espera **ainda em aberto**. É o "33d" do painel do Kommo. */
  maiorEsperaAbertaSegundos: number | null;
  porUsuario: EsperaPorUsuario[];
  porHora: EsperaPorHora[];
  /** O que o leitor precisa saber para não tirar conclusão errada daqui. */
  observacao: string;
}

type Registro = Record<string, unknown>;

/**
 * Tipos de evento que o Kommo usa para mensagem de chat.
 *
 * Variam por conta e por canal, então a lista é generosa de propósito: um tipo
 * que não existe nesta conta simplesmente nunca casa.
 */
const ENTRADA = ["incoming_chat_message", "incoming_message", "chat_message_in"];
const SAIDA = ["outgoing_chat_message", "outgoing_message", "chat_message_out"];

function inicioDoDia(dia: string): number {
  return Date.parse(`${dia}T00:00:00Z`) / 1000;
}

function fimDoDia(dia: string): number {
  return Date.parse(`${dia}T23:59:59Z`) / 1000;
}

function numero(valor: unknown): number | null {
  if (typeof valor === "number" && Number.isFinite(valor)) return valor;
  if (typeof valor === "string" && valor.trim() !== "" && Number.isFinite(Number(valor))) {
    return Number(valor);
  }
  return null;
}

/**
 * Classifica um registro em entrada, saída, ou nada.
 *
 * `created_by: 0` é o Kommo dizendo "não foi um usuário" — mensagem que chegou
 * de fora. Qualquer outro id é alguém da equipe respondendo. Quando o tipo do
 * registro já diz a direção, ele manda; o autor é o desempate.
 */
function direcaoDe(registro: Registro): Mensagem["direcao"] | null {
  const tipo = String(registro.type ?? registro.note_type ?? "").toLowerCase();
  if (ENTRADA.some((t) => tipo.includes(t))) return "entrada";
  if (SAIDA.some((t) => tipo.includes(t))) return "saida";

  // Fora dos tipos conhecidos, só nota de chat conta: nota interna da equipe
  // não é atendimento, e contá-la inventaria resposta que nunca houve.
  if (!tipo.includes("chat") && !tipo.includes("message")) return null;

  const autor = numero(registro.created_by);
  if (autor === null) return null;
  return autor === 0 ? "entrada" : "saida";
}

function lerMensagem(registro: Registro): Mensagem | null {
  const direcao = direcaoDe(registro);
  if (!direcao) return null;

  const segundos = numero(registro.created_at);
  const entidade = numero(registro.entity_id) ?? numero(registro.element_id);
  if (segundos === null || entidade === null) return null;

  const autor = numero(registro.created_by);
  return {
    entidade: String(entidade),
    em: segundos * 1_000,
    direcao,
    usuarioId: direcao === "saida" && autor ? String(autor) : null,
  };
}

/** Uma coleção do Kommo, página por página. `null` quando a fonte recusou. */
async function buscar(
  caminho: string,
  colecao: string,
  de: number,
  ate: number,
): Promise<Registro[] | null> {
  const url = new URL(`${baseDaApi()}${caminho}`);
  url.searchParams.set("filter[created_at][from]", String(de));
  url.searchParams.set("filter[created_at][to]", String(ate));
  url.searchParams.set("limit", String(POR_PAGINA));

  const todos: Registro[] = [];
  let proxima: string | null = url.toString();
  let recusou = true;

  for (let pagina = 0; pagina < MAX_PAGINAS && proxima; pagina++) {
    try {
      const resposta = await fetch(proxima, {
        headers: autorizacao(),
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      });

      // 204 é coleção vazia: a fonte existe, mas não tem o que contar no
      // período. Tratar como recusa mandaria consultar a próxima fonte à toa.
      if (resposta.status === 204) return todos;
      if (!resposta.ok) return recusou ? null : todos;
      recusou = false;

      const json = (await resposta.json()) as {
        _embedded?: Record<string, unknown>;
        _links?: { next?: { href?: string } };
      };
      const lista = json._embedded?.[colecao];
      if (!Array.isArray(lista)) return todos;

      todos.push(...(lista as Registro[]));
      proxima = lista.length === POR_PAGINA ? (json._links?.next?.href ?? null) : null;
    } catch {
      return recusou ? null : todos;
    }
  }

  return todos;
}

/**
 * Procura as mensagens onde elas estiverem.
 *
 * Eventos primeiro: eles trazem a direção no próprio tipo, o que dispensa
 * adivinhar pelo autor. As notas são o plano B, e existem porque boa parte das
 * integrações de WhatsApp só publica por lá.
 */
async function carregar(
  de: number,
  ate: number,
): Promise<{ fonte: Atendimento["fonte"]; mensagens: Mensagem[] }> {
  const eventos = await buscar("/events", "events", de, ate);
  const porEventos = (eventos ?? []).map(lerMensagem).filter((m): m is Mensagem => m !== null);
  if (porEventos.length > 0) return { fonte: "eventos", mensagens: porEventos };

  const notas = await buscar("/leads/notes", "notes", de, ate);
  const porNotas = (notas ?? []).map(lerMensagem).filter((m): m is Mensagem => m !== null);
  if (porNotas.length > 0) return { fonte: "notas", mensagens: porNotas };

  return { fonte: null, mensagens: [] };
}

/** Percentil por interpolação simples. A lista precisa vir ordenada. */
function percentil(ordenados: number[], fracao: number): number | null {
  if (ordenados.length === 0) return null;
  const posicao = (ordenados.length - 1) * fracao;
  const abaixo = Math.floor(posicao);
  const acima = Math.ceil(posicao);
  if (abaixo === acima) return ordenados[abaixo] as number;
  const peso = posicao - abaixo;
  return (ordenados[abaixo] as number) * (1 - peso) + (ordenados[acima] as number) * peso;
}

function mediana(valores: number[]): number | null {
  return percentil(
    [...valores].sort((a, b) => a - b),
    0.5,
  );
}

/** A hora local de um instante, no fuso da clínica. */
function horaLocal(em: number): number {
  const formatada = new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    hour: "numeric",
    hour12: false,
  }).format(new Date(em));
  return Number(formatada) % 24;
}

/** Uma espera medida: quanto o lead aguardou, e quem respondeu. */
interface Espera {
  segundos: number;
  usuarioId: string | null;
  horaDaEntrada: number;
}

/**
 * Caminha cada conversa em ordem e mede o intervalo entrada → resposta.
 *
 * Só a **primeira** entrada sem resposta conta. Um lead que manda cinco
 * mensagens seguidas antes de alguém responder esperou uma vez, não cinco — e
 * contar cinco premiaria o vendedor que demora, porque a média cairia.
 *
 * `limite` é o fim da janela pedida: mensagens além dele existem só para
 * fechar o par, e não abrem espera nova. Sem isso, a folga de dois dias
 * contaria conversas que pertencem ao período seguinte.
 */
function medir(mensagens: Mensagem[], limite: number, agora: number) {
  const porConversa = new Map<string, Mensagem[]>();
  for (const mensagem of mensagens) {
    const lista = porConversa.get(mensagem.entidade) ?? [];
    lista.push(mensagem);
    porConversa.set(mensagem.entidade, lista);
  }

  const esperas: Espera[] = [];
  const abertas: number[] = [];
  let conversas = 0;

  for (const lista of porConversa.values()) {
    lista.sort((a, b) => a.em - b.em);

    let pendente: Mensagem | null = null;
    let contou = false;

    for (const mensagem of lista) {
      if (mensagem.direcao === "entrada") {
        // Entrada fora da janela não abre espera: ela é do período seguinte.
        if (mensagem.em > limite) continue;
        if (!pendente) {
          pendente = mensagem;
          contou = true;
        }
        continue;
      }
      if (pendente) {
        esperas.push({
          segundos: Math.max(0, Math.round((mensagem.em - pendente.em) / 1_000)),
          usuarioId: mensagem.usuarioId,
          horaDaEntrada: horaLocal(pendente.em),
        });
        pendente = null;
      }
    }

    if (contou) conversas += 1;
    // Sobrou entrada sem resposta: a espera continua correndo agora.
    if (pendente) abertas.push(Math.max(0, Math.round((agora - pendente.em) / 1_000)));
  }

  return { conversas, esperas, abertas };
}

function agruparPorUsuario(esperas: Espera[]): EsperaPorUsuario[] {
  const porUsuario = new Map<string, number[]>();
  for (const espera of esperas) {
    if (!espera.usuarioId) continue;
    porUsuario.set(espera.usuarioId, [
      ...(porUsuario.get(espera.usuarioId) ?? []),
      espera.segundos,
    ]);
  }

  return [...porUsuario.entries()]
    .map(([usuarioId, valores]) => ({
      usuarioId,
      respostas: valores.length,
      medianaSegundos: Math.round(mediana(valores) ?? 0),
    }))
    .sort((a, b) => b.respostas - a.respostas);
}

function agruparPorHora(esperas: Espera[]): EsperaPorHora[] {
  const porHora = new Map<number, number[]>();
  for (const espera of esperas) {
    const atual = porHora.get(espera.horaDaEntrada) ?? [];
    atual.push(espera.segundos);
    porHora.set(espera.horaDaEntrada, atual);
  }

  return [...porHora.entries()]
    .map(([hora, valores]) => ({
      hora,
      entradas: valores.length,
      medianaSegundos: Math.round(mediana(valores) ?? 0),
    }))
    .sort((a, b) => a.hora - b.hora);
}

function observar(fonte: Atendimento["fonte"], esperas: number, conversas: number): string {
  if (fonte === null) {
    return "Nenhuma fonte de mensagem respondeu. Ou o token não alcança eventos e notas, ou a integração de WhatsApp não publica mensagem na API — sem isso não há tempo de resposta para medir.";
  }

  if (esperas === 0) {
    return `Fonte "${fonte}" respondeu, mas nenhuma mensagem do período pôde ser classificada em entrada e saída. Os números estão vazios de propósito: inventar direção daria um tempo de resposta que não existe.`;
  }

  return `${esperas} espera(s) medida(s) em ${conversas} conversa(s), da fonte "${fonte}". Mediana é o dia normal; p90 é o dia ruim. Conversa sem resposta nenhuma não entra na mediana — ela aparece em semResposta, que é onde a venda se perde.`;
}

/** Mede o tempo de resposta do atendimento numa janela. Nunca lança. */
export async function medirAtendimento(
  periodo: DateRange,
  agora = Date.now(),
): Promise<Atendimento> {
  const de = inicioDoDia(periodo.from);
  const ate = fimDoDia(periodo.to);
  const comFolga = ate + FOLGA_EM_DIAS * 86_400;

  const { fonte, mensagens } = await carregar(de, comFolga);
  const { conversas, esperas, abertas } = medir(mensagens, ate * 1_000, agora);
  const segundos = esperas.map((e) => e.segundos).sort((a, b) => a - b);

  return {
    periodo,
    fonte,
    conversas,
    respondidas: esperas.length,
    semResposta: abertas.length,
    medianaSegundos: segundos.length > 0 ? Math.round(percentil(segundos, 0.5) as number) : null,
    p90Segundos: segundos.length > 0 ? Math.round(percentil(segundos, 0.9) as number) : null,
    maiorEsperaAbertaSegundos: abertas.length > 0 ? Math.max(...abertas) : null,
    porUsuario: agruparPorUsuario(esperas),
    porHora: agruparPorHora(esperas),
    observacao: observar(fonte, esperas.length, conversas),
  };
}
