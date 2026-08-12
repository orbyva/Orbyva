import { useEffect, useState } from "react";
import { WifiOff, CloudUpload } from "lucide-react";
import { countOfflineOutbox } from "@/lib/offlineOutbox";

type OfflineBannerProps = {
  /** Contagem da outbox (do hook de sync). Se omitido, lê do localStorage. */
  pendingCount?: number;
};

/** Banner global quando o navegador está offline (ou há fila pendente). */
export function OfflineBanner({ pendingCount }: OfflineBannerProps) {
  const [offline, setOffline] = useState(
    () => typeof navigator !== "undefined" && !navigator.onLine
  );
  const [localPending, setLocalPending] = useState(() => countOfflineOutbox());

  useEffect(() => {
    const syncPending = () => setLocalPending(countOfflineOutbox());
    const goOffline = () => {
      setOffline(true);
      syncPending();
    };
    const goOnline = () => {
      setOffline(false);
      syncPending();
    };
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    window.addEventListener("storage", syncPending);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("storage", syncPending);
    };
  }, []);

  const pending = Math.max(pendingCount ?? 0, localPending);

  if (!offline && pending <= 0) return null;

  if (offline) {
    return (
      <div
        role="status"
        data-testid="offline-banner"
        className="flex items-center justify-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-950 dark:text-amber-100"
      >
        <WifiOff className="h-3.5 w-3.5 shrink-0" />
        {pending > 0
          ? `Offline, ${pending} lançamento${pending === 1 ? "" : "s"} na fila para sincronizar.`
          : "Você está offline, lançamentos vão para a fila; leitura usa o último snapshot."}
      </div>
    );
  }

  return (
    <div
      role="status"
      data-testid="offline-banner"
      className="flex items-center justify-center gap-2 border-b border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs text-sky-950 dark:text-sky-100"
    >
      <CloudUpload className="h-3.5 w-3.5 shrink-0" />
      {pending} lançamento{pending === 1 ? "" : "s"} aguardando sincronização…
    </div>
  );
}
