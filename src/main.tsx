import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PwaUpdateBanner } from "@/components/PwaUpdateBanner";
import { AuthProvider } from "@/hooks/useAuth";
import { track } from "@/lib/analytics";
import { handleNeedRefresh } from "@/lib/pwaUpdate";
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

// PWA: fora de formulário → atualiza na hora; em formulário → banner "Atualizar agora".
let refreshing = false;
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    handleNeedRefresh(() => updateSW(true));
  },
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;
    const check = () => void registration.update();
    window.setInterval(check, 60 * 1000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") check();
    });
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <AppRouter />
        <PwaUpdateBanner />
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>
);
