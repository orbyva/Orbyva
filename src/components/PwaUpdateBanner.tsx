import { useSyncExternalStore } from "react";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  applyPendingUpdate,
  isPwaUpdatePending,
  subscribePwaUpdate,
} from "@/lib/pwaUpdate";

function getSnapshot() {
  return isPwaUpdatePending();
}

function getServerSnapshot() {
  return false;
}

/** Só aparece quando há versão nova e o usuário está (ou estava) em formulário. */
export function PwaUpdateBanner() {
  const pending = useSyncExternalStore(
    subscribePwaUpdate,
    getSnapshot,
    getServerSnapshot
  );

  if (!pending) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-[calc(3.75rem+env(safe-area-inset-bottom,0px))] z-[80] flex justify-center px-3 md:bottom-6"
    >
      <div className="flex max-w-md items-center gap-3 rounded-lg border border-border bg-background/95 px-3 py-2.5 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/85">
        <p className="text-sm text-foreground">
          Nova versão disponível. Salve o que estiver fazendo e atualize.
        </p>
        <Button size="sm" className="shrink-0" onClick={() => applyPendingUpdate()}>
          <RefreshCw className="h-3.5 w-3.5" />
          Atualizar agora
        </Button>
      </div>
    </div>
  );
}
