import { Link } from "react-router-dom";
import { ArrowUpRight, PiggyBank, Share2, Wallet, X } from "lucide-react";
import type { RecurringDueAlert } from "@/types/recurring";
import { formatBRL } from "@/lib/currency";
import { monthLabel } from "@/lib/monthSpendShare";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type BudgetHighlight = {
  planned: number;
  spent: number;
  pct: number;
};

type HubLedgerHeroProps = {
  year: number;
  month: number;
  balance: number | null;
  balancePositive: boolean;
  momDespesa: string | null;
  receita: number | null;
  despesa: number | null;
  budgetHighlight: BudgetHighlight | null;
  recurringAlerts: RecurringDueAlert[];
  showNudge: boolean;
  onOpenShare: () => void;
  onDismissNudge: () => void;
};

export function HubLedgerHero({
  year,
  month,
  balance,
  balancePositive,
  momDespesa,
  receita,
  despesa,
  budgetHighlight,
  recurringAlerts,
  showNudge,
  onOpenShare,
  onDismissNudge,
}: HubLedgerHeroProps) {
  return (
    <section className="relative overflow-hidden rounded-2xl bg-primary text-primary-foreground shadow-md">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-white/12"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-14 left-1/4 h-32 w-32 rounded-full bg-black/15"
      />

      <div className="relative px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary-foreground/70">
              Ledger · {monthLabel(year, month)}
            </p>
            <p className="mt-1.5 text-xs text-primary-foreground/70">
              Saldo do mês
            </p>
            <p
              className={cn(
                "mt-0.5 text-xl font-semibold tabular-nums tracking-tight sm:text-3xl",
                !balancePositive && "text-primary-foreground/90"
              )}
            >
              {balance != null ? formatBRL(balance) : "—"}
            </p>
            {momDespesa ? (
              <p className="mt-1 text-[11px] text-primary-foreground/75">
                Despesa {momDespesa}
              </p>
            ) : null}
          </div>
          <Link
            to="/finance/dashboard"
            className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-primary-foreground/90 transition-colors hover:bg-white/15"
          >
            Finanças
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 border-t border-white/15 pt-3 sm:max-w-sm">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-primary-foreground/60">
              Receitas
            </p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums">
              {receita != null ? formatBRL(receita) : "—"}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-primary-foreground/60">
              Despesas
            </p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums">
              {despesa != null ? formatBRL(despesa) : "—"}
            </p>
          </div>
        </div>
      </div>

      <div className="relative grid gap-px border-t border-white/15 bg-white/10 sm:grid-cols-2">
        <Link
          to="/finance/budget"
          className="bg-black/10 px-4 py-3 transition-colors hover:bg-black/15"
        >
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground/65">
            <PiggyBank className="h-3 w-3" />
            Orçamento
          </p>
          {budgetHighlight ? (
            <>
              <p className="mt-1 text-sm font-semibold tabular-nums">
                {formatBRL(budgetHighlight.spent)}
                <span className="font-normal text-primary-foreground/65">
                  {" "}
                  / {formatBRL(budgetHighlight.planned)}
                </span>
              </p>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/20">
                <div
                  className={cn(
                    "h-full rounded-full",
                    budgetHighlight.pct >= 100
                      ? "bg-rose-300"
                      : budgetHighlight.pct >= 80
                        ? "bg-amber-300"
                        : "bg-white"
                  )}
                  style={{
                    width: `${Math.min(100, budgetHighlight.pct)}%`,
                  }}
                />
              </div>
              <p className="mt-1 text-[11px] text-primary-foreground/65">
                {budgetHighlight.pct.toFixed(0)}% usado
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm text-primary-foreground/75">
              Definir teto
            </p>
          )}
        </Link>

        <Link
          to="/finance/recurring"
          className="bg-black/10 px-4 py-3 transition-colors hover:bg-black/15"
        >
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground/65">
            <Wallet className="h-3 w-3" />
            Parcelas
          </p>
          {recurringAlerts.length > 0 ? (
            <ul className="mt-1 space-y-0.5">
              {recurringAlerts.slice(0, 1).map((a) => (
                <li
                  key={`${a.recurring.id}-${a.installmentNumber}`}
                  className="text-sm leading-snug line-clamp-1"
                >
                  {a.message}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-primary-foreground/75">
              Nada urgente
            </p>
          )}
        </Link>
      </div>

      {showNudge && receita != null && despesa != null ? (
        <div className="relative flex flex-wrap items-center justify-between gap-2 border-t border-white/15 bg-black/20 px-4 py-2.5">
          <p className="text-xs text-primary-foreground/85">
            Ritual de {monthLabel(year, month)}
          </p>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="secondary"
              className="h-7 bg-white px-2.5 text-xs text-primary hover:bg-white/90"
              onClick={onOpenShare}
            >
              <Share2 className="mr-1 h-3 w-3" />
              Compartilhar
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-primary-foreground/70 hover:bg-white/10 hover:text-primary-foreground"
              aria-label="Dispensar"
              onClick={onDismissNudge}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
