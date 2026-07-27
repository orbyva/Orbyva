import { useCallback, useEffect, useState } from "react";
import { insertTransaction } from "@/api/finance";
import {
  countOfflineOutbox,
  flushOfflineOutbox,
  type FlushOutboxResult,
} from "@/lib/offlineOutbox";
import { useToast } from "@/hooks/use-toast";

/** Flush da outbox ao voltar online + contagem para o banner. */
export function useOfflineOutboxSync() {
  const { toast } = useToast();
  const [pending, setPending] = useState(() => countOfflineOutbox());

  const refreshCount = useCallback(() => {
    setPending(countOfflineOutbox());
  }, []);

  const flush = useCallback(async (): Promise<FlushOutboxResult | null> => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      refreshCount();
      return null;
    }
    if (countOfflineOutbox() === 0) {
      refreshCount();
      return { synced: 0, failed: 0, remaining: 0 };
    }

    const result = await flushOfflineOutbox(insertTransaction);
    refreshCount();

    if (result.synced > 0) {
      toast({
        title:
          result.synced === 1
            ? "1 lançamento sincronizado"
            : `${result.synced} lançamentos sincronizados`,
        description:
          result.remaining > 0
            ? `${result.remaining} ainda na fila.`
            : "Fila offline esvaziada.",
        duration: 3000,
      });
    } else if (result.failed > 0) {
      toast({
        title: "Falha ao sincronizar",
        description: "Alguns lançamentos offline não foram enviados. Tentaremos de novo.",
        variant: "destructive",
        duration: 4000,
      });
    }

    return result;
  }, [refreshCount, toast]);

  useEffect(() => {
    refreshCount();
    void flush().catch(() => undefined);

    const onOnline = () => {
      void flush().catch(() => undefined);
    };
    const onStorage = () => refreshCount();

    window.addEventListener("online", onOnline);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("storage", onStorage);
    };
  }, [flush, refreshCount]);

  return { pending, flush, refreshCount };
}
