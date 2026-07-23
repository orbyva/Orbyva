import * as Sentry from "@sentry/react";

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;

let initialized = false;

declare global {
  interface Window {
    /** No console: `__orbyvaSentryTest()` — envia um ping ao Sentry. */
    __orbyvaSentryTest?: () => boolean;
  }
}

export function initSentry() {
  if (initialized) return;

  if (!dsn) {
    if (import.meta.env.DEV) {
      console.info(
        "[sentry] VITE_SENTRY_DSN ausente — erros não serão enviados."
      );
    }
    return;
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: import.meta.env.PROD ? 0.15 : 1,
    sendDefaultPii: false,
  });
  initialized = true;

  if (typeof window !== "undefined") {
    window.__orbyvaSentryTest = () => {
      if (!initialized) {
        console.warn("[sentry] Não inicializado.");
        return false;
      }
      Sentry.captureMessage("orbyva sentry ping", "info");
      console.info(
        "[sentry] Ping enviado. Veja Issues / Discover no Sentry em ~1 min."
      );
      return true;
    };
  }

  if (import.meta.env.DEV) {
    console.info("[sentry] Inicializado. Teste: __orbyvaSentryTest()");
  }
}

export function addAnalyticsBreadcrumb(
  event: string,
  props?: Record<string, string | number | boolean | null | undefined>
) {
  if (!initialized) return;
  Sentry.addBreadcrumb({
    category: "analytics",
    message: event,
    data: props,
    level: "info",
  });
}

export { Sentry };
