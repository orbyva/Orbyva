import * as Sentry from "@sentry/react";
import { isAuthRequiredError } from "@/lib/auth-user";

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;

let initialized = false;

declare global {
  interface Window {
    /** No console: `__orbyvaSentryTest()` — envia um ping ao Sentry. */
    __orbyvaSentryTest?: () => boolean;
  }
}

/** Ruído de WebViews (Instagram/Facebook etc.) — não é bug do Orbyva. */
export function isInAppBrowserBridgeNoise(
  event: Pick<Sentry.ErrorEvent, "exception">
): boolean {
  const values = event.exception?.values ?? [];
  for (const ex of values) {
    const msg = `${ex.type ?? ""} ${ex.value ?? ""}`;
    if (/webkit\.messageHandlers/i.test(msg)) return true;
    if (/Can't find variable:\s*webkit/i.test(msg)) return true;

    const frames = ex.stacktrace?.frames ?? [];
    for (const frame of frames) {
      const fn = frame.function ?? "";
      if (/sendDataToNative|sendPageHideMessage/i.test(fn)) return true;
    }
  }
  return false;
}

/** Sessão ausente / logout — esperado; não poluir Issues. */
export function isExpectedAuthNoise(
  event: Pick<Sentry.ErrorEvent, "exception">
): boolean {
  const values = event.exception?.values ?? [];
  for (const ex of values) {
    const msg = `${ex.type ?? ""} ${ex.value ?? ""}`;
    if (/AuthRequiredError/i.test(msg)) return true;
    if (/Usuário não autenticado/i.test(msg)) return true;
  }
  return false;
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
    ignoreErrors: [
      /webkit\.messageHandlers/i,
      /Can't find variable:\s*webkit/i,
      /Usuário não autenticado/i,
      "AuthRequiredError",
      // PWA: falha transitória ao buscar sw.js (rede/deploy). App segue ok.
      /Failed to update a ServiceWorker/i,
      /ServiceWorker.*bad HTTP response/i,
    ],
    beforeSend(event, hint) {
      if (isInAppBrowserBridgeNoise(event)) return null;
      if (isExpectedAuthNoise(event)) return null;
      if (isAuthRequiredError(hint?.originalException)) return null;
      // PostgREST cru (code/details/hint/message) — esperado virar Error tratado na UI.
      const original = hint?.originalException;
      if (
        original &&
        typeof original === "object" &&
        "code" in original &&
        "message" in original &&
        !("name" in original && (original as { name?: string }).name === "Error")
      ) {
        const code = String((original as { code: unknown }).code ?? "");
        if (code === "23503" || code === "23505" || code === "42501") {
          return null;
        }
      }
      return event;
    },
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
