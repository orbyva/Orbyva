import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Circle, PiggyBank, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchTransactionsQuery } from "@/api/finance";
import { useAuth } from "@/hooks/useAuth";
import {
  isFirstBudgetDone,
  isFirstTxDone,
  isTourDone,
  markFirstBudgetDone,
  markFirstTxDone,
} from "@/lib/onboarding";
import { track } from "@/lib/analytics";
import { supabase } from "@/lib/supabase";

/** Checklist finance-first até 1ª tx (+ orçamento opcional). */
export function FirstTxChecklist() {
  const { user } = useAuth();
  const userId = user?.id;
  const [visible, setVisible] = useState(false);
  const [checking, setChecking] = useState(true);
  const [hasTx, setHasTx] = useState(false);
  const [hasBudget, setHasBudget] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) {
      setVisible(false);
      setChecking(false);
      return;
    }

    setChecking(true);
    try {
      const result = await fetchTransactionsQuery({ page: 1, pageSize: 1 });
      const txOk = (result.total ?? result.data.length) > 0;
      setHasTx(txOk);
      if (txOk && !isFirstTxDone(userId)) {
        markFirstTxDone(userId);
        track("first_transaction", { source: "detect" });
      }

      const { count } = await supabase
        .from("monthly_budget")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);
      const budgetOk = (count ?? 0) > 0;
      setHasBudget(budgetOk);
      if (budgetOk && !isFirstBudgetDone(userId)) {
        markFirstBudgetDone(userId);
        track("first_budget", { source: "detect" });
      }

      // Some após tour; some de vez se tx + budget (ou budget marcado done via skip futuro)
      const activationPending = !txOk;
      const budgetPending = txOk && !budgetOk && !isFirstBudgetDone(userId);
      setVisible(isTourDone(userId) && (activationPending || budgetPending));
    } catch {
      setVisible(isTourDone(userId) && !isFirstTxDone(userId));
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
          <p className="text-sm font-semibold">Ative o controle do mês</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Uma transação + orçamento (teto) e, se tiver, parcelas — o trio que
            deixa o mês sob controle. Entretenimento e Vida já estão no menu.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!hasTx ? (
            <Button size="sm" asChild>
              <Link
                to="/finance/transactions"
                onClick={() => track("onboarding_checklist_cta", { step: "tx" })}
              >
                <Wallet className="mr-2 h-4 w-4" />
                Registrar agora
              </Link>
            </Button>
          ) : (
            <Button size="sm" asChild>
              <Link
                to="/finance/budget"
                onClick={() =>
                  track("onboarding_checklist_cta", { step: "budget" })
                }
              >
                <PiggyBank className="mr-2 h-4 w-4" />
                Criar orçamento
              </Link>
            </Button>
          )}
        </div>
      </div>
      <ul className="mt-4 space-y-2 text-sm">
        <li className="flex items-center gap-2 text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          Conta criada · tour {isTourDone(userId) ? "concluído" : "pendente"}
        </li>
        <li
          className={`flex items-center gap-2 ${hasTx ? "text-muted-foreground" : "font-medium"}`}
        >
          {hasTx ? (
            <CheckCircle2 className="h-4 w-4 text-primary" />
          ) : (
            <Circle className="h-4 w-4 text-primary" />
          )}
          Registrar a 1ª receita ou despesa
        </li>
        <li
          className={`flex items-center gap-2 ${
            !hasTx
              ? "text-muted-foreground/60"
              : hasBudget
                ? "text-muted-foreground"
                : "font-medium"
          }`}
        >
          {hasBudget ? (
            <CheckCircle2 className="h-4 w-4 text-primary" />
          ) : (
            <Circle className="h-4 w-4 text-primary" />
          )}
          Orçamento do mês (recomendado)
          {hasTx && !hasBudget ? (
            <button
              type="button"
              className="ml-auto text-xs text-muted-foreground underline"
              onClick={() => {
                markFirstBudgetDone(userId);
                track("onboarding_budget_skip");
                setVisible(false);
              }}
            >
              Pular
            </button>
          ) : null}
        </li>
      </ul>
    </section>
  );
}
