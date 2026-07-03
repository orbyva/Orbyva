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

  const expenseColor =
    expense > plannedExpense ? "text-red-500" : "text-yellow-400";

  const resultColor = net >= 0 ? "text-green-500" : "text-red-500";

  const projectionColor =
    safeProjectedExpense > plannedExpense
      ? "text-red-500"
      : "text-muted-foreground";

  const data = [
    {
      title: "Resultado",
      value: net,
      color: resultColor,
      borderColor: net >= 0 ? "border-green-500" : "border-red-500",
      detail: net >= 0 ? "Saldo positivo" : "Saldo negativo",
      extra: `Livre: ${formatValue(
        availableToSpend
      )} · Previsto: ${formatValue(projectedResult)}`,
      extraColor: projectedResult >= 0 ? "text-green-500" : "text-red-500",
    },
    {
      title: "Gasto",
      value: expense,
      color: expenseColor,
      borderColor:
        expense > plannedExpense ? "border-red-500" : "border-yellow-400",
      detail: `${expensePercentage}% do orçamento`,
      extra: `Orçado: ${formatValue(
        plannedExpense
      )} `,
      extraColor: projectionColor,
    },
    {
      title: "Receita",
      value: income,
      color: "text-blue-500",
      borderColor: "border-blue-500",
      detail: `${incomePercentage}% recebido`,
      extra: `Orçado: ${formatValue(plannedIncome)}`,
      extraColor: "text-muted-foreground",
    },
  ];

  return (
    <div className="grid gap-6 sm:grid-cols-1 lg:grid-cols-3">
      {data.map((card) => (
        <Card key={card.title} className="p-6 rounded-lg shadow-md">
          <CardHeader>
            <CardTitle
              className={`text-lg font-semibold border-b-4 pb-1 ${card.color} ${card.borderColor}`}
            >
              {card.title}
            </CardTitle>
          </CardHeader>

          <CardContent>
            <div className={`text-3xl font-bold ${card.color}`}>
              {formatValue(card.value)}
            </div>

            <p className="mt-1 text-xs text-muted-foreground">
              {card.detail}
            </p>

            {card.extra && (
              <p className={`mt-1 text-xs font-medium ${card.extraColor}`}>
                {card.extra}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}