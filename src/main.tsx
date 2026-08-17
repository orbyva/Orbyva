import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/hooks/useAuth";
import { track } from "@/lib/analytics";
import { handleNeedRefresh } from "@/lib/pwaUpdate";
import "./index.css";
import AppRouter from "./routes";

document.querySelectorAll<HTMLLinkElement>("link[data-boot-css]").forEach((link) => {
  const apply = () => {
    link.media = "all";
  };
  link.addEventListener("load", apply);
  if (link.sheet) apply();
});

const PwaUpdateBanner = lazy(() =>
  import("@/components/PwaUpdateBanner").then((m) => ({
    default: m.PwaUpdateBanner,
  }))
);

function afterLoad(fn: () => void) {
  const run = () => {
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(() => fn(), { timeout: 4000 });
    } else {
      window.setTimeout(fn, 2000);
    }
  };
  if (document.readyState === "complete") run();
  else window.addEventListener("load", run, { once: true });
}

void import("@/lib/sentry").then(({ initSentry }) => {
  afterLoad(initSentry);
});

afterLoad(() => track("app_boot"));

// PWA: fora de formulário → atualiza na hora; em formulário → banner "Atualizar agora".
let refreshing = false;
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}

afterLoad(() => {
  const updateSW = registerSW({
    immediate: false,
    onNeedRefresh() {
      handleNeedRefresh(() => updateSW(true));
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;

      const check = () => {
        void (async () => {
          // Rede ruim / deploy no meio / SW já instalando → update() estoura TypeError no Sentry.
          if (!navigator.onLine || registration.installing) return;
          try {
            const ping = await fetch("/sw.js", {
              cache: "no-store",
              headers: { "cache-control": "no-cache" },
            });
            if (!ping.ok) return;
            await registration.update();
          } catch {
            /* ignore, próximo ciclo tenta de novo */
          }
        })();
      };

      window.setInterval(check, 60 * 1000);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") check();
      });
    },
    onRegisterError() {
      /* silencioso, falha transitória de rede */
    },
  });
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <AppRouter />
        <Suspense fallback={null}>
          <PwaUpdateBanner />
        </Suspense>
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>
);
