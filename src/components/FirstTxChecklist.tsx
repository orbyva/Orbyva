import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Circle, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchTransactionsQuery } from "@/api/finance";
import { useAuth } from "@/hooks/useAuth";
import {
  isFirstTxDone,
  isTourDone,
  markFirstTxDone,
} from "@/lib/onboarding";
import { track } from "@/lib/analytics";

/** Checklist persistente até a 1ª transação existir (por user_id). */
export function FirstTxChecklist() {
  const { user } = useAuth();
  const userId = user?.id;
  const [visible, setVisible] = useState(false);
  const [checking, setChecking] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) {
      setVisible(false);
      setChecking(false);
      return;
    }
    if (isFirstTxDone(userId)) {
      setVisible(false);
      setChecking(false);
      return;
    }

    setChecking(true);
    try {
      const result = await fetchTransactionsQuery({ page: 1, pageSize: 1 });
      if ((result.total ?? result.data.length) > 0) {
        markFirstTxDone(userId);
        track("first_transaction", { source: "detect" });
        setVisible(false);
        return;
      }
      // Só mostra depois do tour (ou se já pulou).
      setVisible(isTourDone(userId));
    } catch {
      setVisible(isTourDone(userId));
    } finally {
      setChecking(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!userId || checking || !visible) return null;

  return (
    <section className="rounded-xl border border-primary/25 bg-primary/5 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Primeiros passos</p>
          <p className="mt-1 text-sm text-muted-foreground">
            O ledger começa com uma transação. Depois o hub ganha vida.
          </p>
        </div>
        <Button size="sm" asChild>
          <Link
            to="/finance/transactions"
            onClick={() => track("onboarding_checklist_cta")}
          >
            <Wallet className="mr-2 h-4 w-4" />
            Registrar agora
          </Link>
        </Button>
      </div>
      <ul className="mt-4 space-y-2 text-sm">
        <li className="flex items-center gap-2 text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          Conta criada · tour {isTourDone(userId) ? "concluído" : "pendente"}
        </li>
        <li className="flex items-center gap-2 font-medium">
          <Circle className="h-4 w-4 text-primary" />
          Registrar a 1ª receita ou despesa
        </li>
      </ul>
    </section>
  );
}
