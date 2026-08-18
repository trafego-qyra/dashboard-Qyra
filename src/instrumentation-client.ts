/**
 * Sentry no browser.
 *
 * O import é dinâmico de propósito: importado estaticamente, o SDK entra no
 * bundle principal e custa ~82 kB em toda página — mesmo sem DSN, mesmo sem
 * enviar nada. Com `import()` o webpack o isola em um chunk que só é buscado
 * quando há DSN configurado.
 */

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

/** Resolvida assim que o SDK carrega; `null` quando não há DSN. */
const sentry = DSN
  ? import("@sentry/nextjs").then((Sentry) => {
      Sentry.init({
        dsn: DSN,
        environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development",
        tracesSampleRate: 0.1,
        // Replay só quando houver erro: gravar sessão inteira é caro e invasivo.
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 1.0,
        sendDefaultPii: false,
      });
      return Sentry;
    })
  : null;

/**
 * Marca o início de uma navegação para o tracing. O Next chama esta função de
 * forma síncrona; sem SDK carregado ela simplesmente não faz nada.
 */
export function onRouterTransitionStart(
  ...args: Parameters<typeof import("@sentry/nextjs").captureRouterTransitionStart>
) {
  void sentry?.then((Sentry) => Sentry.captureRouterTransitionStart(...args));
}
