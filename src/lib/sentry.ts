import * as Sentry from "@sentry/react";

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;

let initialized = false;

export function initSentry() {
  if (initialized || !dsn) return;
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: import.meta.env.PROD ? 0.15 : 1,
    sendDefaultPii: false,
  });
  initialized = true;
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
