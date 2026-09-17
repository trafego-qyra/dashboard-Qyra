import "server-only";

import { createHash } from "node:crypto";

import { montarFbc, normalizarEmail, normalizarNome, normalizarTelefone } from "@/lib/identidade";
import { getCredentials, getEnv } from "@/server/env";
import { httpJson, metaAuthHeaders } from "@/server/lib/http";

/**
 * Eventos de CRM para a Meta, pela API de Conversões.
 *
 * É o único conector do painel que **escreve** numa plataforma. Todos os
 * outros leem métrica; este manda para a Meta o que aconteceu com o lead
 * depois que ele saiu do anúncio — que é a informação que a Meta não tem de
 * jeito nenhum sozinha, e a que faz a otimização parar de perseguir lead
 * barato e passar a perseguir lead que fecha.
 *
 * Os três valores fixos abaixo vêm da instrução de integração de CRM da Meta e
 * não são configuráveis: sem eles o evento é aceito e ignorado.
 *
 * Docs: https://developers.facebook.com/docs/marketing-api/conversions-api
 */

/** A instrução da Meta é explícita: em evento de CRM, sempre este valor. */
const ACTION_SOURCE = "system_generated";

/** Idem — é o que marca a origem como CRM dentro do conjunto de dados. */
const EVENT_SOURCE = "crm";

/** O nome do CRM, como a Meta pede em `lead_event_source`. */
const LEAD_EVENT_SOURCE = "Kommo";

/** Teto de eventos por requisição aceito pela API. */
const MAX_POR_LOTE = 1_000;

/** O que se sabe sobre a pessoa, **antes** de virar hash. */
export interface IdentidadeDoLead {
  email?: string | null;
  telefone?: string | null;
  nome?: string | null;
  sobrenome?: string | null;
  /** `leadgen_id` da Meta. Só existe em formulário instantâneo, não em landing page. */
  leadId?: string | number | null;
  /** `fbclid`, cookie `_fbc` inteiro, ou a URL de entrada com o parâmetro. */
  clique?: string | null;
  /** Cookie `_fbp`, gravado pelo pixel da landing page. */
  navegador?: string | null;
  /** Criação do negócio em milissegundos — base do `fbc` quando só veio o `fbclid`. */
  criadoEmMs: number;
}

export interface EventoDeCrm {
  /** O nome da etapa do CRM — ver a nota sobre colisão em `enviarEventosDeCrm`. */
  eventName: string;
  /** Unix em **segundos**, que é a unidade da API. */
  eventTime: number;
  /** Chave de deduplicação. Reenviar o mesmo id não conta duas vezes. */
  eventId: string;
  identidade: IdentidadeDoLead;
  valor?: number | null;
  moeda?: string;
}

/** Os campos de `user_data` na forma exata em que vão para a Meta. */
export interface DadosDoUsuario {
  em?: string[];
  ph?: string[];
  fn?: string[];
  ln?: string[];
  lead_id?: number | string;
  fbc?: string;
  fbp?: string;
}

interface RespostaDaCapi {
  events_received?: number;
  messages?: unknown[];
  fbtrace_id?: string;
}

const sha256 = (valor: string): string => createHash("sha256").update(valor, "utf8").digest("hex");

/**
 * O `lead_id` da Meta, quando ele é mesmo da Meta.
 *
 * O campo do CRM costuma receber o id do próprio Kommo por engano — um número
 * de 7 ou 8 dígitos. Ele não casa com nada do lado de lá, e mandá-lo só gasta
 * uma tentativa de correspondência. A instrução da Meta especifica 15 a 17
 * dígitos, e é isso que serve de filtro.
 */
function normalizarLeadId(valor: string | number | null | undefined): number | string | null {
  if (valor === null || valor === undefined || valor === "") return null;

  const digitos = String(valor).replace(/\D/g, "");
  if (digitos.length < 15 || digitos.length > 17) return null;

  const numero = Number(digitos);
  // 17 dígitos passam de `Number.MAX_SAFE_INTEGER`: converter trocaria o
  // último dígito em silêncio. Aí a string preserva o valor exato, e a Graph
  // aceita numérico em texto.
  return Number.isSafeInteger(numero) ? numero : digitos;
}

/**
 * `user_data` pronto, ou `null` quando não há em que a Meta se agarre.
 *
 * **Devolver `null` é a parte importante.** Um evento sem identificador é
 * aceito com 200 e entra na conta de eventos sem correspondência, derrubando a
 * qualidade do conjunto inteiro — inclusive a dos eventos bons. É o caso do
 * lead que entrou por DM e nunca deixou telefone: ele não tem como ser
 * enviado, e fingir que tem é pior do que registrar que não tem.
 *
 * Nome e `_fbp` sozinhos não contam: nome não identifica ninguém, e o `_fbp` é
 * um cookie de navegador, não uma pessoa.
 */
export function montarUsuario(identidade: IdentidadeDoLead): DadosDoUsuario | null {
  const email = normalizarEmail(identidade.email);
  const telefone = normalizarTelefone(identidade.telefone);
  const fbc = montarFbc(identidade.clique, identidade.criadoEmMs);
  const leadId = normalizarLeadId(identidade.leadId);

  if (!email && !telefone && !fbc && leadId === null) return null;

  const usuario: DadosDoUsuario = {};

  if (email) usuario.em = [sha256(email)];
  if (telefone) usuario.ph = [sha256(telefone)];

  const nome = normalizarNome(identidade.nome);
  const sobrenome = normalizarNome(identidade.sobrenome);
  if (nome) usuario.fn = [sha256(nome)];
  if (sobrenome) usuario.ln = [sha256(sobrenome)];

  // Identificador de clique, cookie e `lead_id` vão **crus**. Hashear os três
  // é o erro clássico desta integração: a Meta não reconhece o valor, não
  // reclama, e a atribuição simplesmente não acontece.
  if (leadId !== null) usuario.lead_id = leadId;
  if (fbc) usuario.fbc = fbc;
  if (identidade.navegador?.trim()) usuario.fbp = identidade.navegador.trim();

  return usuario;
}

/** Um evento na forma do protocolo, já com os campos fixos da Meta. */
function paraEnvio(evento: EventoDeCrm, usuario: DadosDoUsuario): Record<string, unknown> {
  const custom: Record<string, unknown> = {
    event_source: EVENT_SOURCE,
    lead_event_source: LEAD_EVENT_SOURCE,
  };

  // Valor só entra quando existe de verdade. Mandar `0` ensina a Meta a
  // otimizar para venda que não vale nada — e hoje o campo de valor do Kommo
  // vem vazio na maioria dos negócios (ver docs/integracoes.md).
  if (typeof evento.valor === "number" && Number.isFinite(evento.valor) && evento.valor > 0) {
    custom.value = Math.round(evento.valor * 100) / 100;
    custom.currency = evento.moeda ?? "BRL";
  }

  return {
    event_name: evento.eventName,
    event_time: Math.trunc(evento.eventTime),
    event_id: evento.eventId,
    action_source: ACTION_SOURCE,
    user_data: usuario,
    custom_data: custom,
  };
}

export interface ResultadoDoEnvio {
  /** Quantos a Meta confirmou ter recebido, somando os lotes. */
  recebidos: number;
  /** `event_id` de quem foi enviado. */
  enviados: string[];
  /** `event_id` de quem não tinha identificador — não saiu, e o motivo é este. */
  semIdentificador: string[];
  /** `fbtrace_id` de cada lote. É o que o suporte da Meta pede quando algo não bate. */
  rastreio: string[];
}

/** Divide em lotes do tamanho que a API aceita. */
function emLotes<T>(itens: T[], tamanho: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) lotes.push(itens.slice(i, i + tamanho));
  return lotes;
}

/**
 * Envia os eventos e devolve o que a Meta confirmou.
 *
 * **Sobre o `eventName`:** o conjunto de dados que recebe estes eventos é o
 * mesmo do pixel da landing page, que já dispara `Lead` do navegador. Usar
 * `Lead` aqui faria o mesmo lead ser contado duas vezes. Por isso o nome do
 * evento é o da **etapa do CRM** — que também é o que a instrução da Meta
 * pede, e de quebra deixa o funil legível no Gerenciador de Eventos.
 *
 * **Sobre repetir:** o `httpJson` repete em 429 e 5xx, e repetir um POST é
 * seguro justamente por causa do `event_id` — a Meta deduplica por ele. É o
 * mesmo mecanismo que protege o reenvio do webhook do Kommo.
 *
 * Com `META_CAPI_TEST_EVENT_CODE` preenchido, **todo** envio vai para a aba de
 * eventos de teste e nada entra em produção.
 */
export async function enviarEventosDeCrm(eventos: EventoDeCrm[]): Promise<ResultadoDoEnvio> {
  if (!getCredentials().capi) {
    throw new Error(
      "API de Conversões sem credencial: configure META_CAPI_DATASET_ID e META_CAPI_ACCESS_TOKEN.",
    );
  }

  const env = getEnv();
  const semIdentificador: string[] = [];
  const prontos: Array<{ id: string; corpo: Record<string, unknown> }> = [];

  for (const evento of eventos) {
    const usuario = montarUsuario(evento.identidade);
    if (!usuario) {
      semIdentificador.push(evento.eventId);
      continue;
    }
    prontos.push({ id: evento.eventId, corpo: paraEnvio(evento, usuario) });
  }

  const resultado: ResultadoDoEnvio = {
    recebidos: 0,
    enviados: prontos.map((p) => p.id),
    semIdentificador,
    rastreio: [],
  };

  if (prontos.length === 0) return resultado;

  const url = `https://graph.facebook.com/${env.META_CAPI_API_VERSION}/${env.META_CAPI_DATASET_ID}/events`;

  for (const lote of emLotes(prontos, MAX_POR_LOTE)) {
    const corpo: Record<string, unknown> = { data: lote.map((item) => item.corpo) };
    if (env.META_CAPI_TEST_EVENT_CODE) corpo.test_event_code = env.META_CAPI_TEST_EVENT_CODE;

    const resposta = await httpJson<RespostaDaCapi>(url, {
      method: "POST",
      headers: {
        ...metaAuthHeaders(env.META_CAPI_ACCESS_TOKEN as string),
        "content-type": "application/json",
      },
      body: JSON.stringify(corpo),
    });

    resultado.recebidos += resposta.events_received ?? 0;
    if (resposta.fbtrace_id) resultado.rastreio.push(resposta.fbtrace_id);
  }

  return resultado;
}
