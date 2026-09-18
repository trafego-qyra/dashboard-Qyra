import "server-only";

import { getCredentials } from "@/server/env";
import { atualizar, contar, excluir, inserir, selecionar } from "@/server/lib/supabase";

/**
 * A ponte entre o clique no anúncio e a venda no Kommo.
 *
 * O identificador do clique (`fbc`) só existe no navegador de quem veio do
 * anúncio, e o questionário não o repassa ao CRM. Mas ele repassa o
 * `cliente_id` — que fica no `localStorage` do navegador **e** no campo
 * `qyra_cliente_id` do negócio. Essa coincidência é a chave de junção: com
 * `cliente_id -> fbc` guardado aqui, o webhook junta os dois lados na hora do
 * GANHO sem o questionário mudar uma linha.
 *
 * É um desvio, e é assumido como tal: o caminho certo é o questionário gravar
 * o `fbc` direto no negócio. Enquanto isso não acontece, o webhook lê o campo
 * do negócio **primeiro** e só cai aqui quando ele não existe — então, no dia
 * em que o caminho certo funcionar, esta ponte para de ser usada sozinha.
 *
 * O que atravessa é um UUID opaco e um identificador de clique. Nome, telefone,
 * e-mail e resposta de saúde continuam onde estão.
 */

const TABELA = "captura_clique";

/** Quanto tempo uma captura sem venda continua guardada. O mesmo da fila. */
const DIAS_ATE_O_EXPURGO = 90;

/**
 * Formato do cookie `_fbc`: `fb.<subdomínio>.<milissegundos>.<fbclid>`.
 *
 * Validar aqui não é preciosismo: esta rota é pública por necessidade, e o que
 * não parecer um identificador de clique não vira linha no banco.
 */
const FORMATO_DO_CLIQUE = /^fb\.\d\.\d{10,16}\.[\w-]{1,400}$/;
const FORMATO_DO_NAVEGADOR = /^fb\.\d\.\d{10,16}\.\d{1,20}$/;

/**
 * O `cliente_id` é um UUID gerado pelo questionário.
 *
 * Exigir o formato é o que segura a porta: sem sessão e sem cabeçalho secreto,
 * o que impede alguém de encher a tabela é não conseguir adivinhar um UUID.
 */
const FORMATO_DO_CLIENTE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Uma UTM cabe com folga nisto. O limite existe para o corpo não crescer. */
const MAXIMO_DA_UTM = 200;

/** O que o navegador manda, já conferido. */
export interface CapturaDoNavegador {
  clienteId: string;
  fbc: string | null;
  fbp: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
}

/** Uma linha da tabela, como o PostgREST a devolve. */
interface LinhaDaPonte {
  cliente_id: string;
  fbc: string | null;
  fbp: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
}

function texto(valor: unknown, limite: number, formato?: RegExp): string | null {
  if (typeof valor !== "string") return null;

  const limpo = valor.trim();
  if (limpo === "" || limpo.length > limite) return null;
  if (formato && !formato.test(limpo)) return null;

  return limpo;
}

/**
 * Confere o corpo da requisição e devolve `null` se não servir.
 *
 * Devolve `null` também quando vem um `cliente_id` válido e mais nada: linha
 * sem clique nem origem não liga campanha a venda nenhuma, só ocupa espaço.
 */
export function lerCaptura(bruto: unknown): CapturaDoNavegador | null {
  if (typeof bruto !== "object" || bruto === null) return null;

  const corpo = bruto as Record<string, unknown>;
  const clienteId = texto(corpo.cliente_id, 64, FORMATO_DO_CLIENTE);
  if (!clienteId) return null;

  const capturado: CapturaDoNavegador = {
    clienteId: clienteId.toLowerCase(),
    fbc: texto(corpo.fbc, 500, FORMATO_DO_CLIQUE),
    fbp: texto(corpo.fbp, 100, FORMATO_DO_NAVEGADOR),
    utmSource: texto(corpo.utm_source, MAXIMO_DA_UTM),
    utmMedium: texto(corpo.utm_medium, MAXIMO_DA_UTM),
    utmCampaign: texto(corpo.utm_campaign, MAXIMO_DA_UTM),
    utmContent: texto(corpo.utm_content, MAXIMO_DA_UTM),
  };

  const temAlgoUtil =
    capturado.fbc !== null ||
    capturado.utmSource !== null ||
    capturado.utmMedium !== null ||
    capturado.utmCampaign !== null ||
    capturado.utmContent !== null;

  return temAlgoUtil ? capturado : null;
}

/**
 * Guarda a captura, preservando o que já estava lá.
 *
 * O navegador manda o que tem **agora**. Uma visita orgânica posterior chega
 * sem `fbc`, e sobrescrever a linha inteira apagaria o clique que trouxe a
 * pessoa. Por isso cada campo novo só entra quando traz valor: o que chega
 * vazio deixa o que estava guardado em paz.
 */
export async function registrar(captura: CapturaDoNavegador): Promise<void> {
  if (!getCredentials().banco) return;

  const anterior = await buscarLinha(captura.clienteId);

  const campos = {
    fbc: captura.fbc ?? anterior?.fbc ?? null,
    fbp: captura.fbp ?? anterior?.fbp ?? null,
    utm_source: captura.utmSource ?? anterior?.utm_source ?? null,
    utm_medium: captura.utmMedium ?? anterior?.utm_medium ?? null,
    utm_campaign: captura.utmCampaign ?? anterior?.utm_campaign ?? null,
    utm_content: captura.utmContent ?? anterior?.utm_content ?? null,
  };

  if (anterior) {
    await atualizar(
      TABELA,
      { cliente_id: `eq.${captura.clienteId}` },
      { ...campos, atualizado_em: new Date().toISOString() },
    );
    return;
  }

  await inserir(TABELA, [{ cliente_id: captura.clienteId, ...campos }]);
}

async function buscarLinha(clienteId: string): Promise<LinhaDaPonte | null> {
  const linhas = await selecionar<LinhaDaPonte>(TABELA, {
    cliente_id: `eq.${clienteId}`,
    limit: "1",
  });

  return linhas[0] ?? null;
}

/** O que a ponte sabe sobre um cliente, para o webhook completar a identidade. */
export interface CliqueDaPonte {
  fbc: string | null;
  fbp: string | null;
}

/**
 * Procura o clique de um cliente. Nunca lança.
 *
 * Quem chama é o webhook do Kommo, no caminho de uma venda. A ponte é um
 * complemento: se o banco não responder, é melhor mandar o evento com telefone
 * e e-mail do que não mandar venda nenhuma.
 */
export async function buscarClique(clienteId: string): Promise<CliqueDaPonte | null> {
  if (!getCredentials().banco) return null;

  const id = texto(clienteId, 64, FORMATO_DO_CLIENTE);
  if (!id) return null;

  try {
    const linha = await buscarLinha(id.toLowerCase());
    if (!linha || (!linha.fbc && !linha.fbp)) return null;

    return { fbc: linha.fbc, fbp: linha.fbp };
  } catch {
    return null;
  }
}

/**
 * Quantas capturas a ponte guarda, e quantas trazem clique.
 *
 * Existe porque o diagnóstico do Kommo mede o campo **no negócio** — e a ponte,
 * por definição, funciona sem ele. Sem este número, alguém olharia
 * `comClique: 0` com a ponte trabalhando e concluiria que nada funcionou.
 *
 * Nunca lança: é informação de diagnóstico, não pode derrubar a rota.
 */
export async function resumoDaPonte(): Promise<{ guardadas: number; comClique: number } | null> {
  if (!getCredentials().banco) return null;

  try {
    const [guardadas, comClique] = await Promise.all([
      contar(TABELA, {}, "cliente_id"),
      contar(TABELA, { fbc: "not.is.null" }, "cliente_id"),
    ]);

    return { guardadas, comClique };
  } catch {
    return null;
  }
}

/**
 * Apaga capturas antigas.
 *
 * Uma captura só serve até a venda acontecer. Passados noventa dias sem isso,
 * a janela de atribuição da Meta já fechou e a linha virou só dado guardado
 * sem finalidade — que é exatamente o que a LGPD manda não fazer.
 */
export async function expurgar(): Promise<void> {
  if (!getCredentials().banco) return;

  const limite = new Date(Date.now() - DIAS_ATE_O_EXPURGO * 24 * 60 * 60 * 1_000);
  await excluir(TABELA, { criado_em: `lt.${limite.toISOString()}` });
}
