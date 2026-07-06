import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { formatBRL } from "@/lib/currency";

interface BudgetSummaryProps {
  plannedExpense: number;
  plannedIncome: number;
  expense: number;
  income: number;
  projectedExpense: number;
}

const formatValue = (value: number) => formatBRL(Number(value || 0));

export function BudgetSummary({
  plannedExpense,
  plannedIncome,
  expense,
  income,
  projectedExpense,
}: BudgetSummaryProps) {
  const net = income - expense;
  const safeProjectedExpense = Math.max(expense, projectedExpense);
  const expensePercentage =
    plannedExpense > 0
      ? Number(((expense / plannedExpense) * 100).toFixed(1))
      : 0;
  const incomePercentage =
    plannedIncome > 0
      ? Number(((income / plannedIncome) * 100).toFixed(1))
      : 0;
  const availableToSpend = plannedExpense - expense;
  const projectedResult = plannedIncome - safeProjectedExpense;

  const data = [
    {
      title: "Resultado",
      value: net,
      titleClass:
        net >= 0
          ? "text-primary border-primary/50"
          : "text-destructive border-destructive/50",
      valueClass: net >= 0 ? "text-primary" : "text-destructive",
      detail: net >= 0 ? "Saldo positivo" : "Saldo negativo",
      extra: `Livre: ${formatValue(availableToSpend)} · Previsto: ${formatValue(projectedResult)}`,
      extraClass:
        projectedResult >= 0 ? "text-success" : "text-destructive",
    },
    {
      title: "Gasto",
      value: expense,
      titleClass:
        expense > plannedExpense
          ? "text-destructive border-destructive/50"
          : "text-warning border-warning/50",
      valueClass:
        expense > plannedExpense ? "text-destructive" : "text-warning",
      detail: `${expensePercentage}% do orçamento`,
      extra: `Orçado: ${formatValue(plannedExpense)}`,
      extraClass:
        safeProjectedExpense > plannedExpense
          ? "text-destructive"
          : "text-muted-foreground",
    },
    {
      title: "Receita",
      value: income,
      titleClass: "text-success border-success/50",
      valueClass: "text-success",
      detail: `${incomePercentage}% recebido`,
      extra: `Orçado: ${formatValue(plannedIncome)}`,
      extraClass: "text-muted-foreground",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-3">
      {data.map((card) => (
        <Card key={card.title} className="p-6">
          <CardHeader className="p-0 pb-3">
            <CardTitle
              className={`text-sm font-semibold uppercase tracking-wide border-b-2 pb-1.5 ${card.titleClass}`}
            >
              {card.title}
            </CardTitle>
          </CardHeader>

          <CardContent className="p-0">
            <div className={`text-3xl font-bold tabular-nums ${card.valueClass}`}>
              {formatValue(card.value)}
            </div>

            <p className="mt-1 text-xs text-muted-foreground">{card.detail}</p>

            {card.extra && (
              <p className={`mt-1 text-xs font-medium ${card.extraClass}`}>
                {card.extra}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
