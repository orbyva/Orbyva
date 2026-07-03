/** Briefing amplo para consultoria — busca dados em paralelo, sem loop de IA. */

interface BriefingDeps {
  executeTool: (
    name: string,
    args: Record<string, unknown>
  ) => Promise<{ result: unknown; pendingAction?: Record<string, unknown> }>;
}

export interface BriefingResult {
  intent: string;
  data: unknown;
}

function currentMonthRef() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function budgetMonthRef(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function monthLabel(year: number, month: number) {
  const label = new Date(year, month - 1, 1).toLocaleString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export async function prefetchConsultantBriefing(
  deps: BriefingDeps
): Promise<BriefingResult> {
  const { year, month } = currentMonthRef();

  const [insights, balance, categories, recurring, budget] = await Promise.all([
    deps.executeTool("generate_insights", { year, month }),
    deps.executeTool("get_balance_history", { months: 6 }),
    deps.executeTool("get_spending_by_category", {
      year,
      month,
      nature: "Despesa",
    }),
    deps.executeTool("get_recurring_summary", {}),
    deps.executeTool("get_budget_status", {
      budget_month: budgetMonthRef(year, month),
    }),
  ]);

  return {
    intent: `consultoria financeira — ${monthLabel(year, month)}`,
    data: {
      period: { year, month, label: monthLabel(year, month) },
      analysis: insights.result,
      balanceHistory: balance.result,
      topExpenses: categories.result,
      recurring: recurring.result,
      budget: budget.result,
    },
  };
}

export function isCadastroRequest(text: string): boolean {
  return /cadastr|registrar|criar|crie|adicion|inser|lancar|lançar|propor|anotar|colocar.*despesa|colocar.*receita|parcela de r\$|despesa de r\$|receita de r\$|\d+(,\d+)?\s*(reais|r\$).*?(despesa|receita|transa)/i.test(
    text
  );
}

export function needsTransactionSearch(text: string): boolean {
  return (
    /busca(r|ndo)?.*transa|listar.*transa|transa(ç|c)(õ|o)es de|gastos com|gastei com|paguei.*em/i.test(
      text
    ) && !/quanto (eu )?(gastei|gasto)/i.test(text)
  );
}
