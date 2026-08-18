/**
 * Observabilidade.
 *
 * O Sentry é o backbone: captura erro de servidor, de edge e de browser, e já
 * exporta spans em OpenTelemetry (o SDK do Next é construído sobre OTel). Isso
 * cobre erro + tracing com uma dependência.
 *
 * Datadog e New Relic não entram por padrão — três APMs concorrentes no mesmo
 * app seria custo e ruído sem ganho. Ambos consomem OTLP, então quando houver
 * necessidade basta apontar o exporter (docs/qualidade.md § Observabilidade).
 *
 * Sem `SENTRY_DSN` nada é inicializado: rodar local ou em preview não gera
 * evento nem custo.
 */

export async function register() {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;

  if (process.env.NEXT_RUNTIME === "nodejs") {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
      release: process.env.VERCEL_GIT_COMMIT_SHA,
      // 10% dos requests: suficiente para ver tendência sem estourar a cota.
      tracesSampleRate: 0.1,
      // O painel exibe dado de negócio; nada de corpo de requisição ou header.
      sendDefaultPii: false,
      beforeSend: scrub,
    });
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
      tracesSampleRate: 0.1,
      sendDefaultPii: false,
      beforeSend: scrub,
    });
  }
}

/** Remove qualquer coisa parecida com token antes do evento sair da máquina. */
function scrub<T extends { request?: { url?: string } }>(event: T): T {
  if (event.request?.url) {
    event.request.url = event.request.url.replace(
      /(access_token|token|key|secret)=[^&]+/gi,
      "$1=[redacted]",
    );
  }
  return event;
}

export async function onRequestError(
  ...args: Parameters<NonNullable<typeof import("@sentry/nextjs").captureRequestError>>
) {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(...args);
}
