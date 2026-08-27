import "server-only";

/**
 * Cliente HTTP compartilhado pelos conectores.
 *
 * Um único ponto para timeout, retry e mensagem de erro — evita que cada
 * integração invente a própria política.
 */

export interface HttpOptions extends Omit<RequestInit, "signal"> {
  /** Tempo máximo por tentativa. */
  timeoutMs?: number;
  /** Tentativas extras em 429/5xx/rede. */
  retries?: number;
}

export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/**
 * Remove qualquer coisa parecida com credencial de um texto.
 *
 * A mensagem de erro das plataformas costuma ecoar a requisição inteira,
 * inclusive o `access_token` da query string. Sem isso, expor o erro para
 * diagnóstico vazaria o segredo.
 */
export function redactSecrets(text: string): string {
  return (
    text
      // Nomeado, em query string (`?access_token=…`) ou em JSON
      // (`"client_secret": "…"`). A Graph ecoa a query; o Google responde em
      // JSON — cobrir só um dos dois deixa metade dos vazamentos passar.
      .replace(
        /("?\b(?:access_token|client_secret|refresh_token|developer[-_]token)"?\s*[:=]\s*"?)[^",&\s}]+/gi,
        "$1[oculto]",
      )
      // Pelo formato, para o caso de o segredo aparecer solto no meio de uma
      // mensagem, sem o nome do campo por perto.
      .replace(/\bEAA[A-Za-z0-9]{20,}\b/g, "[token-oculto]")
      // Google: token de acesso OAuth, segredo do cliente e refresh token.
      .replace(/\bya29\.[A-Za-z0-9._-]{10,}/g, "[token-oculto]")
      .replace(/\bGOCSPX-[A-Za-z0-9._-]{10,}/g, "[segredo-oculto]")
      .replace(/\b1\/\/[A-Za-z0-9._-]{20,}/g, "[token-oculto]")
  );
}

/**
 * Resumo curto de um erro, para virar aviso na tela.
 *
 * Passa pelo `redactSecrets` porque a resposta das plataformas costuma ecoar a
 * requisição, e a requisição leva token. Mora aqui, e não no conector, porque
 * todo conector precisa da mesma coisa — e duplicar significaria um deles
 * esquecer a redação um dia.
 */
export function descreverFalha(erro: unknown): string {
  const bruto = erro instanceof Error ? erro.message : String(erro);
  const corpo = (erro as HttpError)?.body;
  const texto = redactSecrets(typeof corpo === "string" && corpo ? `${bruto} — ${corpo}` : bruto);
  return texto.length > 240 ? `${texto.slice(0, 240)}…` : texto;
}

const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

function backoffMs(attempt: number): number {
  return Math.min(2 ** attempt * 250, 4_000);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function httpJson<T>(url: string, options: HttpOptions = {}): Promise<T> {
  const { timeoutMs = 15_000, retries = 2, headers, ...init } = options;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...init,
        headers: { accept: "application/json", ...headers },
        signal: controller.signal,
        cache: "no-store",
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        const error = new HttpError(
          `${response.status} ${response.statusText} em ${new URL(url).host}`,
          response.status,
          body.slice(0, 500),
        );
        if (RETRYABLE.has(response.status) && attempt < retries) {
          lastError = error;
          await sleep(backoffMs(attempt));
          continue;
        }
        throw error;
      }

      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
      const retryable = !(error instanceof HttpError) && attempt < retries;
      if (!retryable) throw error;
      await sleep(backoffMs(attempt));
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/**
 * Cabeçalho de autenticação da Graph API.
 *
 * A Meta aceita `Authorization: Bearer`, e usar isso em vez de
 * `?access_token=` mantém o segredo fora da URL — que é registrada em log de
 * plataforma, em breadcrumb de monitoramento e na própria mensagem de erro que
 * a Graph devolve ecoando a requisição.
 */
export function metaAuthHeaders(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}
