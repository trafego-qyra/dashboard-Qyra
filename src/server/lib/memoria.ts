import "server-only";

import { getEnv } from "@/server/env";

/**
 * Memória que sobrevive à instância.
 *
 * Existe por um caso concreto: a API do Clarity dá dez chamadas por dia, e
 * quando elas acabam a tela precisa mostrar a última leitura boa em vez de um
 * erro — a diretoria abrir o painel e ver vazio não é opção. Um cache em
 * memória não serve: a Vercel sobe instâncias novas o tempo todo, e cada uma
 * nasce sem lembrança nenhuma.
 *
 * **Opcional por construção.** Sem Redis configurado tudo continua funcionando,
 * só que a lembrança volta a valer por instância. Nenhum caminho do painel
 * depende disto existir, e é assim que deve ser: um armazenamento auxiliar que
 * derruba a tela quando falta é pior que nenhum.
 *
 * Fala REST direto, sem SDK. São duas chamadas HTTP; uma dependência a mais
 * para isso pagaria manutenção sem entregar nada.
 */

interface Credencial {
  url: string;
  token: string;
}

function credencial(): Credencial | null {
  const env = getEnv();
  const url = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/+$/, ""), token } : null;
}

/** Lembrança por instância, para quando não há Redis. */
const local = new Map<string, { valor: unknown; expiraEm: number }>();

/**
 * Guarda um valor. Falha em silêncio de propósito.
 *
 * Isto é rede de segurança, e rede de segurança que derruba a operação quando
 * ela mesma falha é pior que não ter rede.
 */
export async function lembrar(chave: string, valor: unknown, ttlSegundos: number): Promise<void> {
  local.set(chave, { valor, expiraEm: Date.now() + ttlSegundos * 1_000 });

  const cred = credencial();
  if (!cred) return;

  try {
    await fetch(`${cred.url}/set/${encodeURIComponent(chave)}?EX=${ttlSegundos}`, {
      method: "POST",
      headers: { authorization: `Bearer ${cred.token}`, "content-type": "application/json" },
      body: JSON.stringify(valor),
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
    });
  } catch {
    // Sem Redis a lembrança local ainda vale.
  }
}

/**
 * Lê um valor guardado. A lembrança local vem primeiro — é mais rápida e não
 * gasta rede —, e o Redis cobre a instância que acabou de nascer.
 */
export async function lembrado<T>(chave: string): Promise<T | null> {
  const aqui = local.get(chave);
  if (aqui && aqui.expiraEm > Date.now()) return aqui.valor as T;

  const cred = credencial();
  if (!cred) return null;

  try {
    const resposta = await fetch(`${cred.url}/get/${encodeURIComponent(chave)}`, {
      headers: { authorization: `Bearer ${cred.token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
    });
    if (!resposta.ok) return null;

    // O Upstash devolve `{ result: "<json em string>" }`, ou `result: null`
    // quando a chave não existe.
    const { result } = (await resposta.json()) as { result?: string | null };
    if (typeof result !== "string") return null;

    return JSON.parse(result) as T;
  } catch {
    return null;
  }
}
