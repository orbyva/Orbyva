import {
  isComparisonQuestion,
  monthLabel,
  resolveComparisonMonths,
  spendingRatePercent,
} from "./month-parser.ts";

interface ComparisonDeps {
  executeTool: (
    name: string,
    args: Record<string, unknown>
  ) => Promise<{ result: unknown; pendingAction?: Record<string, unknown> }>;
}

export interface MonthSummaryRow {
  year: number;
  month: number;
  label: string;
  income: number;
  expense: number;
  balance: number;
  incomeFormatted?: string;
  expenseFormatted?: string;
  balanceFormatted?: string;
  transactionCount: number;
  spendingRatePercent: number | null;
}

export async function prefetchMonthComparison(
  userMessage: string,
  deps: ComparisonDeps
): Promise<{ intent: string; data: unknown } | null> {
  if (!isComparisonQuestion(userMessage)) return null;

  const monthRefs = resolveComparisonMonths(userMessage);
  if (monthRefs.length < 2) return null;

  const summaries = await Promise.all(
    monthRefs.map((ref) =>
      deps.executeTool("get_monthly_summary", { year: ref.year, month: ref.month })
    )
  );

  const months: MonthSummaryRow[] = monthRefs.map((ref, i) => {
    const row = summaries[i].result as {
      income: number;
      expense: number;
      balance: number;
      incomeFormatted?: string;
      expenseFormatted?: string;
      balanceFormatted?: string;
      transactionCount?: number;
    };

    return {
      year: ref.year,
      month: ref.month,
      label: monthLabel(ref.year, ref.month),
      income: row.income,
      expense: row.expense,
      balance: row.balance,
      incomeFormatted: row.incomeFormatted,
      expenseFormatted: row.expenseFormatted,
      balanceFormatted: row.balanceFormatted,
      transactionCount: row.transactionCount ?? 0,
      spendingRatePercent: spendingRatePercent(row.income, row.expense),
    };
  });

  const [first, second] = months;
  const expenseChangePercent =
    first.expense > 0
      ? Math.round(((second.expense - first.expense) / first.expense) * 1000) / 10
      : null;
  const incomeChangePercent =
    first.income > 0
      ? Math.round(((second.income - first.income) / first.income) * 1000) / 10
      : null;
  const spendingRateChange =
    first.spendingRatePercent !== null && second.spendingRatePercent !== null
      ? Math.round((second.spendingRatePercent - first.spendingRatePercent) * 10) / 10
      : null;

  const labels = months.map((m) => m.label).join(" vs ");

  return {
    intent: `comparação financeira — ${labels}`,
    data: {
      months,
      comparison: {
        from: first.label,
        to: second.label,
        expenseChangePercent,
        incomeChangePercent,
        spendingRateChange,
        balanceChange: second.balance - first.balance,
      },
      note: "Todos os meses solicitados estão em 'months'. Use esses dados — não diga que faltam.",
    },
  };
}

export function formatMonthComparisonDirect(data: {
  months: MonthSummaryRow[];
  comparison: Record<string, unknown>;
}): string {
  const lines = data.months.map((m) => {
    const rate =
      m.spendingRatePercent !== null ? `${m.spendingRatePercent}% da renda` : "sem renda no período";
    return (
      `• ${m.label}: receitas ${m.incomeFormatted ?? m.income}, despesas ${m.expenseFormatted ?? m.expense}, ` +
      `saldo ${m.balanceFormatted ?? m.balance}, gastos = ${rate}, ${m.transactionCount} transações`
    );
  });

  const c = data.comparison;
  return (
    `Comparação ${c.from} → ${c.to}:\n${lines.join("\n")}\n` +
    `• Variação despesas: ${c.expenseChangePercent ?? "—"}%\n` +
    `• Variação taxa de gastos (despesa/renda): ${c.spendingRateChange ?? "—"} p.p.`
  );
}
