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

class HttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
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
