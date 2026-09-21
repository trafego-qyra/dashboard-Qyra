import "server-only";

import { autorizacao, baseDaApi } from "@/server/connectors/kommo";

/**
 * O que o Kommo deixa ler de conversa — descoberto, não suposto.
 *
 * A integração de WhatsApp do Kommo é de terceiro, e cada uma grava a conversa
 * num lugar diferente: umas viram nota no negócio, outras só existem dentro da
 * API de Chats (que pertence a quem instalou o canal, não a nós), e outras não
 * saem da interface. Não dá para saber qual é o caso desta conta lendo
 * documentação: só perguntando à API.
 *
 * Esta sonda pergunta. Ela bate em cada endpoint candidato e relata o que veio
 * de volta — **a forma, nunca o conteúdo**.
 *
 * Essa separação não é escrúpulo: a resposta desta rota acaba colada em
 * conversa, tíquete e captura de tela. Conversa de paciente sobre emagrecimento
 * e injetável é dado sensível de saúde (LGPD, art. 11), e dado sensível não
 * vaza por diagnóstico. Tipo de mensagem, quantidade, autor e tamanho bastam
 * para desenhar o que vem depois; o texto, não.
 */

/** Quantos registros pedir em cada sondagem. Uma página basta para o retrato. */
const AMOSTRA = 50;

/** O que uma sondagem descobriu sobre um endpoint. */
interface Sondagem {
  nome: string;
  caminho: string;
  status: number;
  /** Quantos registros vieram. `null` quando a resposta não foi lista. */
  itens: number | null;
  /** Nomes dos campos do primeiro registro. Nome de campo não é dado pessoal. */
  campos?: string[];
  /** Quantos registros de cada tipo — é o que diz onde a mensagem mora. */
  tipos?: Record<string, number>;
  /** Por tipo: quantos trazem texto, e o tamanho médio dele. Nunca o texto. */
  texto?: Record<string, { comTexto: number; tamanhoMedio: number }>;
  /** Quantos autores distintos. Sem isso não há análise por vendedor. */
  autoresDistintos?: number;
  /** O que o Kommo respondeu quando recusou. */
  erro?: string;
}

export interface Sonda {
  conclusao: string;
  endpoints: Sondagem[];
}

/** Um registro do Kommo, do jeito solto que ele chega. */
type Registro = Record<string, unknown>;

/**
 * Onde a conversa pode estar.
 *
 * A ordem é a da probabilidade, não a da vontade: as notas são o caminho que
 * costuma existir, e a API de Chats o que costuma faltar.
 */
const CANDIDATOS = [
  {
    nome: "notas-de-negocio",
    caminho: `/leads/notes?limit=${AMOSTRA}&order[created_at]=desc`,
    colecao: "notes",
  },
  {
    nome: "notas-de-contato",
    caminho: `/contacts/notes?limit=${AMOSTRA}&order[created_at]=desc`,
    colecao: "notes",
  },
  { nome: "conversas", caminho: `/talks?limit=${AMOSTRA}`, colecao: "talks" },
  { nome: "eventos", caminho: `/events?limit=${AMOSTRA}`, colecao: "events" },
] as const;

/** O texto de uma nota mora em lugares diferentes conforme o tipo. */
function tamanhoDoTexto(registro: Registro): number {
  const params = registro.params;
  if (typeof params !== "object" || params === null) return 0;

  const candidatos = ["text", "message", "comment"];
  for (const chave of candidatos) {
    const valor = (params as Registro)[chave];
    if (typeof valor === "string" && valor.length > 0) return valor.length;
  }
  return 0;
}

function autorDe(registro: Registro): string | null {
  for (const chave of ["created_by", "responsible_user_id", "author_id"]) {
    const valor = registro[chave];
    if (typeof valor === "number" || typeof valor === "string") return String(valor);
  }
  return null;
}

function resumir(registros: Registro[]): Partial<Sondagem> {
  const tipos: Record<string, number> = {};
  const acumulado: Record<string, { comTexto: number; total: number }> = {};
  const autores = new Set<string>();

  for (const registro of registros) {
    const tipo = String(registro.note_type ?? registro.type ?? "sem_tipo");
    tipos[tipo] = (tipos[tipo] ?? 0) + 1;

    const tamanho = tamanhoDoTexto(registro);
    if (tamanho > 0) {
      const alvo = acumulado[tipo] ?? { comTexto: 0, total: 0 };
      alvo.comTexto += 1;
      alvo.total += tamanho;
      acumulado[tipo] = alvo;
    }

    const autor = autorDe(registro);
    if (autor) autores.add(autor);
  }

  const texto: Record<string, { comTexto: number; tamanhoMedio: number }> = {};
  for (const [tipo, { comTexto, total }] of Object.entries(acumulado)) {
    texto[tipo] = { comTexto, tamanhoMedio: Math.round(total / comTexto) };
  }

  return {
    itens: registros.length,
    campos: registros[0] ? Object.keys(registros[0]).sort() : [],
    tipos,
    texto: Object.keys(texto).length > 0 ? texto : undefined,
    autoresDistintos: autores.size,
  };
}

async function sondar(candidato: (typeof CANDIDATOS)[number]): Promise<Sondagem> {
  const base: Sondagem = {
    nome: candidato.nome,
    caminho: candidato.caminho,
    status: 0,
    itens: null,
  };

  try {
    const resposta = await fetch(`${baseDaApi()}${candidato.caminho}`, {
      headers: autorizacao(),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });

    base.status = resposta.status;

    // 204 é a resposta do Kommo para coleção vazia. Endpoint existe, conta não
    // tem o que mostrar — que é diferente de endpoint fechado.
    if (resposta.status === 204) return { ...base, itens: 0 };

    const corpo = await resposta.text();
    if (!resposta.ok) {
      // A mensagem do Kommo diz *por que* recusou: escopo, permissão ou rota
      // inexistente. É a informação que decide se vale insistir.
      return { ...base, erro: corpo.slice(0, 300) };
    }

    const json = JSON.parse(corpo) as { _embedded?: Record<string, unknown> };
    const colecao = json._embedded?.[candidato.colecao];
    if (!Array.isArray(colecao)) return { ...base, itens: null };

    return { ...base, ...resumir(colecao as Registro[]) };
  } catch (erro) {
    return { ...base, erro: erro instanceof Error ? erro.message : "falha na chamada" };
  }
}

function concluir(endpoints: Sondagem[]): string {
  const comTexto = endpoints.filter((e) => e.texto && Object.keys(e.texto).length > 0);
  const abertos = endpoints.filter((e) => e.status === 200 || e.status === 204);

  if (abertos.length === 0) {
    return "Nenhum endpoint de conversa respondeu. Ou o token não tem o escopo, ou a integração de WhatsApp não publica nada na API — veja o campo erro de cada linha.";
  }

  if (comTexto.length === 0) {
    return `${abertos.length} endpoint(s) respondem, mas nenhum traz texto de mensagem. Dá para medir tempo de resposta, tentativas e conversa parada; aderência a script, não.`;
  }

  const onde = comTexto.map((e) => e.nome).join(", ");
  const tipos = comTexto.flatMap((e) => Object.keys(e.texto ?? {})).join(", ");
  return `Texto de mensagem disponível em: ${onde} (tipos: ${tipos}). Dá para medir tempo de resposta e também analisar conteúdo.`;
}

/** Bate em cada endpoint candidato e relata a forma do que veio. */
export async function sondarConversas(): Promise<Sonda> {
  const endpoints = await Promise.all(CANDIDATOS.map(sondar));
  return { conclusao: concluir(endpoints), endpoints };
}
