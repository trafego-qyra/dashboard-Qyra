import "server-only";

import { env } from "@/server/env";

/**
 * Cache TTL em memória, por instância.
 *
 * Deliberadamente simples: o gargalo real é a latência das APIs externas, e
 * uma instância serverless serve muitas requisições da mesma janela. Redis só
 * entra quando houver múltiplas regiões ou invalidação cross-instância — puxar
 * essa dependência agora seria overengineering.
 */

interface Entry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, Entry<unknown>>();
/** Teto de segurança: o cache é auxiliar, não pode virar vazamento. */
const MAX_ENTRIES = 200;

export async function cached<T>(
  key: string,
  loader: () => Promise<T>,
  ttlSeconds = env.REPORT_CACHE_TTL,
): Promise<T> {
  if (ttlSeconds <= 0) return loader();

  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expiresAt > now) return hit.value as T;

  const value = await loader();

  if (store.size >= MAX_ENTRIES) {
    // FIFO simples: a chave mais antiga sai.
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  store.set(key, { value, expiresAt: now + ttlSeconds * 1_000 });
  return value;
}

export function clearCache(): void {
  store.clear();
}
