import "server-only";

import { buscarClique } from "@/server/captura/ponte";
import {
  autorizacao,
  baseDaApi,
  type ComCamposPersonalizados,
  campo,
  GANHO,
} from "@/server/connectors/kommo";
import type { EventoDeCrm, IdentidadeDoLead } from "@/server/connectors/meta-capi";
import { getEnv } from "@/server/env";
import { httpJson } from "@/server/lib/http";

/**
 * O gatilho: o Kommo avisa quando um negócio muda de etapa, e isso vira evento
 * para a Meta.
 *
 * Duas coisas tornam este módulo mais chato do que parece.
 *
 * **O webhook do Kommo é magro.** Ele manda o id do negócio e a etapa nova, e
 * mais nada — nem telefone, nem e-mail, nem UTM. Tudo que identifica a pessoa
 * mora no contato vinculado, e sai de duas consultas à API.
 *
 * **O corpo vem em formulário, não em JSON.** O Kommo herdou do amoCRM o
 * formato `leads[status][0][id]=123`, que nenhum `request.json()` entende.
 */

/** Etapas que viram evento. As demais mudanças de etapa são ignoradas. */
const QUALIFICADO = "Qualificado";
const COMPRA = "Purchase";

/** Onde o `fbclid` pode ter sido gravado no negócio. */
const NOMES_DE_CLIQUE = ["fbc", "_fbc", "fbclid", "click id", "clickid"];

/** Onde o cookie do navegador pode ter sido gravado. */
const NOMES_DE_NAVEGADOR = ["fbp", "_fbp"];

/**
 * Onde o identificador que o questionário grava no negócio pode estar.
 *
 * É a chave da ponte: o mesmo valor vive no `localStorage` do navegador, onde
 * o `fbc` também está. Ver src/server/captura/ponte.ts.
 */
const NOMES_DE_CLIENTE = ["qyra_cliente_id", "cliente_id", "customer_id"];

interface ContatoDoKommo extends ComCamposPersonalizados {
  id: number;
  first_name?: string;
  last_name?: string;
  name?: string;
}

interface LeadComContatos extends ComCamposPersonalizados {
  id: number;
  price?: number;
  status_id?: number;
  created_at?: number;
  _embedded?: { contacts?: Array<{ id: number; is_main?: boolean }> };
}

/** Uma mudança de etapa, como o webhook a descreve. */
export interface MudancaDeEtapa {
  leadId: number;
  statusId: number;
  /** O funil em que ela aconteceu. Sem isto, `142` de qualquer funil viraria venda. */
  pipelineId: number | null;
}

/**
 * Lê o corpo do webhook.
 *
 * O Kommo manda `application/x-www-form-urlencoded` com chaves aninhadas:
 * `leads[status][0][id]`, `leads[status][0][status_id]`, e assim por diante.
 * Só `leads[status]` interessa — `leads[add]` e `leads[update]` disparam em
 * qualquer edição do negócio, inclusive quando alguém só corrige um nome.
 */
export function lerMudancas(corpo: string): MudancaDeEtapa[] {
  const parametros = new URLSearchParams(corpo);
  const porIndice = new Map<string, Partial<MudancaDeEtapa>>();

  for (const [chave, valor] of parametros) {
    const partes = chave.match(/^leads\[status\]\[(\d+)\]\[(id|status_id|pipeline_id)\]$/);
    if (!partes) continue;

    const [, indice, campoDoKommo] = partes;
    const atual = porIndice.get(indice) ?? {};
    const numero = Number(valor);
    if (!Number.isFinite(numero)) continue;

    if (campoDoKommo === "id") atual.leadId = numero;
    else if (campoDoKommo === "status_id") atual.statusId = numero;
    else atual.pipelineId = numero;
    porIndice.set(indice, atual);
  }

  return [...porIndice.values()]
    .filter(
      (m): m is Partial<MudancaDeEtapa> & { leadId: number; statusId: number } =>
        typeof m.leadId === "number" && typeof m.statusId === "number",
    )
    .map((m) => ({ leadId: m.leadId, statusId: m.statusId, pipelineId: m.pipelineId ?? null }));
}

/**
 * O nome do evento para uma mudança, ou `null` quando ela não interessa.
 *
 * **O funil precisa bater primeiro, e essa é a parte que não é óbvia.** Os ids
 * `142` (ganho) e `143` (perdido) são fixos em toda conta do Kommo, e o mesmo
 * par se repete em **cada funil**. A conta da clínica tem dois: no de vendas o
 * `142` é "GANHO"; no de clientes, é "Arquivo". Sem conferir o funil, arquivar
 * um cliente viraria uma venda inventada na Meta — e uma que ninguém
 * desconfiaria, porque o número só sobe.
 *
 * `KOMMO_PIPELINE_ID` é a mesma variável que o relatório de Vendas já usa para
 * não somar pós-venda no faturamento. Sem ela configurada, qualquer funil
 * passa: é o comportamento antigo, e a tela de Vendas já avisa que ele mistura.
 */
export function nomeDoEvento(mudanca: MudancaDeEtapa): string | null {
  const funilEsperado = Number(getEnv().KOMMO_PIPELINE_ID);
  if (
    Number.isFinite(funilEsperado) &&
    funilEsperado > 0 &&
    mudanca.pipelineId !== null &&
    mudanca.pipelineId !== funilEsperado
  ) {
    return null;
  }

  if (mudanca.statusId === GANHO) return COMPRA;

  const qualificado = Number(getEnv().KOMMO_ETAPA_QUALIFICADO);
  if (Number.isFinite(qualificado) && qualificado > 0 && mudanca.statusId === qualificado) {
    return QUALIFICADO;
  }

  return null;
}

/** O negócio, com os contatos vinculados. */
async function buscarLead(leadId: number): Promise<LeadComContatos> {
  return httpJson<LeadComContatos>(`${baseDaApi()}/leads/${leadId}?with=contacts`, {
    headers: autorizacao(),
  });
}

/**
 * O contato principal do negócio.
 *
 * É dele que saem telefone e e-mail — o negócio em si não os guarda. Quando o
 * Kommo não marca nenhum como principal, o primeiro serve: a conta da clínica
 * raramente vincula mais de um.
 */
async function buscarContato(lead: LeadComContatos): Promise<ContatoDoKommo | null> {
  const vinculados = lead._embedded?.contacts ?? [];
  const escolhido = vinculados.find((c) => c.is_main) ?? vinculados[0];
  if (!escolhido) return null;

  try {
    return await httpJson<ContatoDoKommo>(`${baseDaApi()}/contacts/${escolhido.id}`, {
      headers: autorizacao(),
    });
  } catch {
    // Sem o contato ainda pode haver `fbc` no negócio. Metade da identidade é
    // melhor que nenhuma, e o conector decide sozinho se dá para enviar.
    return null;
  }
}

/** O que se sabe sobre a pessoa, juntando negócio e contato. */
function montarIdentidade(lead: LeadComContatos, contato: ContatoDoKommo | null): IdentidadeDoLead {
  // O nome no Kommo vem inteiro quando a integração de WhatsApp cria o
  // contato, e separado quando alguém cadastra à mão.
  const inteiro = contato?.name?.trim().split(/\s+/) ?? [];

  return {
    telefone: contato ? campo(contato, ["phone", "telefone", "celular", "whatsapp"]) : null,
    email: contato ? campo(contato, ["email", "e-mail"]) : null,
    nome: contato?.first_name || inteiro[0] || null,
    sobrenome: contato?.last_name || (inteiro.length > 1 ? inteiro[inteiro.length - 1] : null),
    clique: campo(lead, NOMES_DE_CLIQUE),
    navegador: campo(lead, NOMES_DE_NAVEGADOR),
    criadoEmMs: (lead.created_at ?? Math.floor(Date.now() / 1_000)) * 1_000,
  };
}

/**
 * Completa o que faltou usando a ponte de captura.
 *
 * O campo do negócio vem **primeiro**, sempre: no dia em que o questionário
 * gravar o `fbc` direto no Kommo, esta função para de fazer diferença sozinha,
 * sem ninguém precisar desligar nada.
 *
 * Nunca lança. A ponte é um complemento — é melhor mandar a venda com telefone
 * e e-mail do que não mandar venda nenhuma porque o banco demorou.
 */
async function completarPelaPonte(
  lead: LeadComContatos,
  identidade: IdentidadeDoLead,
): Promise<IdentidadeDoLead> {
  if (identidade.clique) return identidade;

  const clienteId = campo(lead, NOMES_DE_CLIENTE);
  if (!clienteId) return identidade;

  const daPonte = await buscarClique(clienteId);
  if (!daPonte) return identidade;

  return {
    ...identidade,
    clique: daPonte.fbc ?? identidade.clique,
    navegador: identidade.navegador ?? daPonte.fbp,
  };
}

/**
 * Transforma as mudanças de etapa em eventos prontos para a fila.
 *
 * O `eventId` é `kommo-<negócio>-<etapa>`, e é estável de propósito: o Kommo
 * reenvia webhook, e um negócio que volta para a mesma etapa é o mesmo fato.
 * Chave estável é o que faz a segunda entrega ser um silêncio em vez de uma
 * venda contada duas vezes.
 */
export async function eventosDaMudanca(mudancas: MudancaDeEtapa[]): Promise<EventoDeCrm[]> {
  const interessantes = mudancas
    .map((mudanca) => ({ mudanca, eventName: nomeDoEvento(mudanca) }))
    .filter(
      (item): item is { mudanca: MudancaDeEtapa; eventName: string } => item.eventName !== null,
    );

  const eventos = await Promise.all(
    interessantes.map(async ({ mudanca, eventName }): Promise<EventoDeCrm | null> => {
      try {
        const lead = await buscarLead(mudanca.leadId);
        const contato = await buscarContato(lead);

        return {
          eventName,
          // A etapa mudou agora: o webhook é o próprio carimbo de tempo.
          eventTime: Math.floor(Date.now() / 1_000),
          eventId: `kommo-${mudanca.leadId}-${mudanca.statusId}`,
          identidade: await completarPelaPonte(lead, montarIdentidade(lead, contato)),
          // Valor só na venda. Numa etapa intermediária o campo costuma estar
          // preenchido com a expectativa, não com o que foi pago.
          valor: eventName === COMPRA ? (lead.price ?? null) : null,
        };
      } catch {
        // Um negócio que a API não devolveu não pode derrubar os outros do
        // mesmo lote. A varredura diária pega o que faltou.
        return null;
      }
    }),
  );

  return eventos.filter((e): e is EventoDeCrm => e !== null);
}
