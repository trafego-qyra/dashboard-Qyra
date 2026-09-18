import "server-only";

import { getEnv } from "@/server/env";
import { httpJson } from "@/server/lib/http";

/**
 * Cliente mínimo do Supabase, por HTTP.
 *
 * O Supabase expõe cada tabela como REST (PostgREST), então falar com ele é
 * `fetch` — do mesmo jeito que os conectores falam com a Meta e o Google. O SDK
 * oficial traria autenticação, realtime e storage que este projeto não usa, e a
 * regra da casa é não carregar o que não se usa (ver AGENTS.md).
 *
 * Reaproveitar o `httpJson` traz de graça o timeout, a repetição em 429 e 5xx,
 * e a redação de segredo na mensagem de erro.
 *
 * **A chave usada é a `service_role`**: ela ignora as políticas de linha do
 * Postgres. Por isso este módulo é `server-only` e nada aqui pode acabar num
 * componente — a fronteira do `.dependency-cruiser.cjs` é o que garante isso.
 */

function base(): string {
  return `${getEnv().SUPABASE_URL}/rest/v1`;
}

function cabecalhos(extra: Record<string, string> = {}): Record<string, string> {
  const chave = getEnv().SUPABASE_SERVICE_ROLE_KEY as string;
  return {
    apikey: chave,
    authorization: `Bearer ${chave}`,
    "content-type": "application/json",
    ...extra,
  };
}

/**
 * `SELECT`, com a query string do PostgREST.
 *
 * `filtros` vai como está para a URL: `{ status: "eq.pendente" }` vira
 * `?status=eq.pendente`. É a sintaxe do PostgREST, e traduzi-la aqui só criaria
 * uma segunda linguagem para aprender.
 */
export async function selecionar<T>(
  tabela: string,
  filtros: Record<string, string> = {},
): Promise<T[]> {
  const url = new URL(`${base()}/${tabela}`);
  for (const [chave, valor] of Object.entries(filtros)) url.searchParams.set(chave, valor);

  return httpJson<T[]>(url.toString(), { headers: cabecalhos() });
}

/**
 * `INSERT`, ignorando o que já existe.
 *
 * `resolution=ignore-duplicates` é o que torna a gravação repetível: o mesmo
 * negócio chegando duas vezes pelo webhook não vira duas linhas nem erro de
 * chave duplicada — a segunda simplesmente não acontece.
 */
export async function inserir(tabela: string, linhas: unknown[]): Promise<void> {
  if (linhas.length === 0) return;

  await httpJson<unknown>(`${base()}/${tabela}`, {
    method: "POST",
    headers: cabecalhos({ prefer: "resolution=ignore-duplicates,return=minimal" }),
    body: JSON.stringify(linhas),
  });
}

/** `UPDATE ... WHERE`, com os mesmos filtros do `selecionar`. */
export async function atualizar(
  tabela: string,
  filtros: Record<string, string>,
  campos: Record<string, unknown>,
): Promise<void> {
  const url = new URL(`${base()}/${tabela}`);
  for (const [chave, valor] of Object.entries(filtros)) url.searchParams.set(chave, valor);

  await httpJson<unknown>(url.toString(), {
    method: "PATCH",
    headers: cabecalhos({ prefer: "return=minimal" }),
    body: JSON.stringify(campos),
  });
}

/**
 * Quantas linhas casam com o filtro, sem trazer nenhuma.
 *
 * O PostgREST devolve o total no cabeçalho `content-range` quando se pede
 * `count=exact`, então isto não passa pelo `httpJson`: o corpo não interessa,
 * o cabeçalho sim.
 */
export async function contar(
  tabela: string,
  filtros: Record<string, string> = {},
): Promise<number> {
  const url = new URL(`${base()}/${tabela}`);
  for (const [chave, valor] of Object.entries(filtros)) url.searchParams.set(chave, valor);
  url.searchParams.set("select", "event_id");

  const resposta = await fetch(url.toString(), {
    headers: cabecalhos({ prefer: "count=exact", range: "0-0" }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  if (!resposta.ok) {
    throw new Error(`${resposta.status} ${resposta.statusText} ao contar ${tabela}`);
  }

  // `content-range: 0-0/42` — o que importa é o que vem depois da barra.
  const total = resposta.headers.get("content-range")?.split("/")[1];
  return total && total !== "*" ? Number(total) : 0;
}

/** `DELETE ... WHERE`, com os mesmos filtros do `selecionar`. */
export async function excluir(tabela: string, filtros: Record<string, string>): Promise<void> {
  const url = new URL(`${base()}/${tabela}`);
  for (const [chave, valor] of Object.entries(filtros)) url.searchParams.set(chave, valor);

  await httpJson<unknown>(url.toString(), {
    method: "DELETE",
    headers: cabecalhos({ prefer: "return=minimal" }),
  });
}
