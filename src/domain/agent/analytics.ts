import type {
  BudgetStatusItem,
  CategorySpending,
  CategoryTrend,
  MonthlySummary,
  TransactionRow,
  UnusualExpense,
} from "./types";

export function buildMonthlySummary(
  year: number,
  month: number,
  income: number,
  expense: number
): MonthlySummary {
  return {
    year,
    month,
    income,
    expense,
    balance: income - expense,
  };
}

export function aggregateSpendingByCategory(
  transactions: TransactionRow[]
): CategorySpending[] {
  const map = new Map<string, CategorySpending>();

  for (const tx of transactions) {
    const typeName = tx.class?.type?.name ?? "Sem tipo";
    const className = tx.class?.name ?? "Sem classe";
    const nature = tx.class?.type?.nature?.name ?? "Desconhecido";
    const key = `${nature}|${typeName}|${className}`;

    const existing = map.get(key) ?? {
      typeName,
      className,
      nature,
      total: 0,
      transactionCount: 0,
    };

    existing.total += Number(tx.value);
    existing.transactionCount += 1;
    map.set(key, existing);
  }

  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

export function calculateCategoryTrends(
  currentMonthTx: TransactionRow[],
  previousMonthTx: TransactionRow[]
): CategoryTrend[] {
  const sumByCategory = (rows: TransactionRow[]) => {
    const totals = new Map<string, number>();
    for (const tx of rows) {
      const category = tx.class?.type?.name ?? "Outros";
      totals.set(category, (totals.get(category) ?? 0) + Number(tx.value));
    }
    return totals;
  };

  const current = sumByCategory(currentMonthTx);
  const previous = sumByCategory(previousMonthTx);
  const categories = new Set([...current.keys(), ...previous.keys()]);

  return Array.from(categories)
    .map((category) => {
      const currentMonth = current.get(category) ?? 0;
      const previousMonth = previous.get(category) ?? 0;
      const changePercent =
        previousMonth === 0
          ? currentMonth > 0
            ? 100
            : 0
          : ((currentMonth - previousMonth) / previousMonth) * 100;

      return {
        category,
        currentMonth,
        previousMonth,
        changePercent: Math.round(changePercent * 10) / 10,
      };
    })
    .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
}

export function detectUnusualExpenses(
  transactions: TransactionRow[],
  multiplier = 2
): UnusualExpense[] {
  const expenses = transactions.filter(
    (tx) => tx.class?.type?.nature?.name === "Despesa"
  );

  const totalsByCategory = new Map<string, { sum: number; count: number }>();
  for (const tx of expenses) {
    const category = tx.class?.type?.name ?? "Outros";
    const stat = totalsByCategory.get(category) ?? { sum: 0, count: 0 };
    stat.sum += Number(tx.value);
    stat.count += 1;
    totalsByCategory.set(category, stat);
  }

  const unusual: UnusualExpense[] = [];

  for (const tx of expenses) {
    const category = tx.class?.type?.name ?? "Outros";
    const stat = totalsByCategory.get(category);
    if (!stat || stat.count < 2) continue;

    const average = stat.sum / stat.count;
    const value = Number(tx.value);

    if (value >= average * multiplier) {
      unusual.push({
        id: tx.id,
        description: tx.description,
        value,
        transactionAt: tx.transaction_at,
        category,
        reason: `Valor ${Math.round((value / average) * 10) / 10}x acima da média da categoria (${category}).`,
      });
    }
  }

  return unusual.sort((a, b) => b.value - a.value).slice(0, 10);
}

export function generateInsightsFromData(input: {
  currentSummary: MonthlySummary;
  previousSummary: MonthlySummary | null;
  trends: CategoryTrend[];
  budgetItems: BudgetStatusItem[];
  unusualExpenses: UnusualExpense[];
  recurringCount: number;
}): string[] {
  const insights: string[] = [];
  const { currentSummary, previousSummary, trends, budgetItems, unusualExpenses, recurringCount } =
    input;

  if (previousSummary) {
    const expenseChange =
      previousSummary.expense === 0
        ? 0
        : ((currentSummary.expense - previousSummary.expense) /
            previousSummary.expense) *
          100;

    if (Math.abs(expenseChange) >= 10) {
      const direction = expenseChange > 0 ? "aumentaram" : "diminuíram";
      insights.push(
        `Suas despesas ${direction} ${Math.abs(Math.round(expenseChange))}% em relação ao mês anterior.`
      );
    }

    const balanceChange = currentSummary.balance - previousSummary.balance;
    if (Math.abs(balanceChange) >= 100) {
      insights.push(
        balanceChange >= 0
          ? `Seu saldo melhorou em relação ao mês anterior.`
          : `Seu saldo piorou em relação ao mês anterior.`
      );
    }
  }

  for (const trend of trends.slice(0, 3)) {
    if (Math.abs(trend.changePercent) >= 15) {
      const direction = trend.changePercent > 0 ? "aumento" : "queda";
      insights.push(
        `A categoria "${trend.category}" teve ${direction} de ${Math.abs(trend.changePercent)}% em relação ao mês anterior.`
      );
    }
  }

  for (const item of budgetItems) {
    if (item.status === "CRÍTICO" || item.status === "ESTOUROU") {
      insights.push(
        `O orçamento de "${item.typeName}${item.className ? ` / ${item.className}` : ""}" está em situação ${item.status.toLowerCase()}.`
      );
    } else if (item.percentageUsed >= 80 && item.planned > 0) {
      insights.push(
        `"${item.typeName}" já consumiu ${Math.round(item.percentageUsed)}% do orçamento planejado.`
      );
    }
  }

  if (unusualExpenses.length > 0) {
    insights.push(
      `Encontrei ${unusualExpenses.length} despesa(s) acima do padrão habitual este mês.`
    );
  }

  if (recurringCount > 0) {
    insights.push(
      `Você tem ${recurringCount} parcela(s)/recorrência(s) ativa(s) no sistema.`
    );
  }

  return insights.slice(0, 6);
}

export function formatMonthLabel(year: number, month: number): string {
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}
