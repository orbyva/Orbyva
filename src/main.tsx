import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/hooks/useAuth";
import { track } from "@/lib/analytics";
import "./index.css";
import AppRouter from "./routes";

void import("@/lib/sentry").then(({ initSentry }) => {
  const boot = () => initSentry();
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(() => boot(), { timeout: 4000 });
  } else {
    setTimeout(boot, 2500);
  }
});
track("app_boot");

// PWA: atualiza em background — NUNCA força reload (fecha modais / perde estado)
registerSW({
  immediate: true,
  onNeedRefresh() {
    // Nova versão disponível; aplica no próximo load natural, sem reload agora
  },
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;
    const hour = 60 * 60 * 1000;
    window.setInterval(() => {
      void registration.update();
    }, hour);
  },
});

// Service workers antigos (autoUpdate) às vezes ainda forçam reload
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    // intencional: sem location.reload()
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>
);
