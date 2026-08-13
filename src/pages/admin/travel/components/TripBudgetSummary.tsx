import { formatBRL } from "@/lib/currency";
import { cn } from "@/lib/utils";
import type { TripFull } from "@/types/travel";

type TripBudgetSummaryProps = {
  trip: TripFull;
  hasBudget: boolean;
  budgetProgress: number;
  overBudget: boolean;
};

export function TripBudgetSummary({
  trip,
  hasBudget,
  budgetProgress,
  overBudget,
}: TripBudgetSummaryProps) {
  return (
    <section className="rounded-lg border bg-card p-4 space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-center">
        <div>
          <p className="text-xs text-muted-foreground">Orçamento</p>
          <p className="font-bold">
            {hasBudget ? formatBRL(trip.budget as number) : "·"}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">
            {trip.isShared ? "Gasto do grupo" : "Gasto total"}
          </p>
          <p className="font-bold text-destructive">
            {formatBRL(trip.expenseTotal)}
          </p>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <p className="text-xs text-muted-foreground">
            {hasBudget ? "Restante" : "Gastos"}
          </p>
          <p
            className={cn(
              "font-bold",
              hasBudget
                ? overBudget
                  ? "text-destructive"
                  : "text-success"
                : "text-foreground"
            )}
          >
            {hasBudget && trip.budgetRemaining != null
              ? formatBRL(trip.budgetRemaining)
              : `${trip.expenses.length} lançamento${trip.expenses.length === 1 ? "" : "s"}`}
          </p>
        </div>
      </div>
      {hasBudget && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              {budgetProgress.toFixed(0)}% do orçamento utilizado
            </span>
            {overBudget && (
              <span className="text-destructive font-medium">
                Acima do orçamento
              </span>
            )}
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                overBudget ? "bg-destructive" : "bg-primary"
              )}
              style={{ width: `${Math.min(100, budgetProgress)}%` }}
            />
          </div>
        </div>
      )}
      {!hasBudget && (
        <p className="text-xs text-muted-foreground text-center">
          Defina um orçamento editando a viagem para acompanhar o comparativo.
        </p>
      )}
    </section>
  );
}
