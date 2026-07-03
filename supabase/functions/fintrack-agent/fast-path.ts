import { hasExplicitMonth, parseMonthFromText, monthLabel } from "./month-parser.ts";
import { prefetchMonthComparison } from "./month-comparison.ts";

interface PrefetchDeps {
  executeTool: (
    name: string,
    args: Record<string, unknown>
  ) => Promise<{ result: unknown; pendingAction?: Record<string, unknown> }>;
}

export interface PrefetchResult {
  intent: string;
  data: unknown;
}

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function currentMonthRef() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function budgetMonthRef() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function monthDateRange(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

export async function prefetchAgentData(
  userMessage: string,
  deps: PrefetchDeps
): Promise<PrefetchResult | null> {
  const comparison = await prefetchMonthComparison(userMessage, deps);
  if (comparison) return comparison;

  const text = normalize(userMessage);
  const explicitMonth = hasExplicitMonth(userMessage);
  const { year, month } = explicitMonth
    ? parseMonthFromText(userMessage)
    : currentMonthRef();

  if (
    /quanto (eu )?(gastei|gasto|gastou)|despesa(s)? (do )?(mes|mês)|gastos (do )?(mes|mês)/.test(
      text
    ) ||
    (explicitMonth && /gast|despesa|saldo|receita/.test(text))
  ) {
    const { result } = await deps.executeTool("get_monthly_summary", { year, month });
    return {
      intent: `resumo financeiro de ${monthLabel(year, month)}`,
      data: result,
    };
  }

  if (/saldo (do|no|este|em) (mes|mês)|meu saldo (no|do|este)/.test(text) && !/ultimos|últimos/.test(text)) {
    const { result } = await deps.executeTool("get_monthly_summary", { year, month });
    return {
      intent: `saldo de ${monthLabel(year, month)}`,
      data: result,
    };
  }

  if (/saldo|ultimos \d+ meses|historico|histórico/.test(text)) {
    const monthsMatch = text.match(/(\d+)\s*meses?/);
    const months = monthsMatch ? Math.min(Number(monthsMatch[1]), 12) : 3;
    const { result } = await deps.executeTool("get_balance_history", { months });
    return { intent: `saldo dos últimos ${months} meses`, data: result };
  }

  if (/categorias.*(aumento|maior|compar)/.test(text) || /maior aumento/.test(text)) {
    const { result } = await deps.executeTool("get_category_trends", { year, month });
    return {
      intent: `variação de categorias em ${monthLabel(year, month)}`,
      data: result,
    };
  }

  if (/maiores gastos|maior gasto|maiores despesas|top.*gastos/.test(text)) {
    const { start, end } = monthDateRange(year, month);
    const [spending, txs] = await Promise.all([
      deps.executeTool("get_spending_by_category", { year, month, nature: "Despesa" }),
      deps.executeTool("search_transactions", {
        nature: "Despesa",
        start_date: start,
        end_date: end,
        limit: 8,
      }),
    ]);
    return {
      intent: `maiores gastos — ${monthLabel(year, month)}`,
      data: {
        period: { year, month, label: monthLabel(year, month) },
        byClass: (spending.result as { byClass?: unknown }).byClass,
        byType: (spending.result as { byType?: unknown }).byType,
        topTransactions: (txs.result as { transactions?: unknown }).transactions,
      },
    };
  }

  if (/classes.*impact|impact.*resultado|tipos.*impact|maior impacto|concentr/.test(text)) {
    const { result } = await deps.executeTool("get_spending_by_category", { year, month });
    return {
      intent: `impacto por tipo e classe — ${monthLabel(year, month)}`,
      data: result,
    };
  }

  if (/ponto de atencao|pontos de atencao|merecem atencao|incomplet|inconsistent/.test(text)) {
    const { result } = await deps.executeTool("generate_insights", { year, month });
    return {
      intent: `pontos de atenção — ${monthLabel(year, month)}`,
      data: result,
    };
  }

  if (/fora do padrao|anomal|despesas incomum/.test(text)) {
    const { result } = await deps.executeTool("find_unusual_expenses", { year, month });
    return {
      intent: `despesas fora do padrão em ${monthLabel(year, month)}`,
      data: result,
    };
  }

  if (/orcamento/.test(text)) {
    const { result } = await deps.executeTool("get_budget_status", {
      budget_month: budgetMonthRef(),
    });
    return {
      intent: `orçamento de ${monthLabel(year, month)}`,
      data: result,
    };
  }

  if (/recorren|parcela/.test(text) && /resumo|status|como esta|como está|ativas/.test(text)) {
    const { result } = await deps.executeTool("get_recurring_summary", {});
    return { intent: "recorrências e parcelas ativas", data: result };
  }

  if (
    /insight|panorama|visao geral|visão geral|resumo geral|como estou financeiramente|consultor|analise|análise|diagnostico|diagnóstico|o que voce acha|o que você acha|me ajude|recomend|melhorar financeiramente|melhor desempenho/.test(
      text
    )
  ) {
    const { result } = await deps.executeTool("generate_insights", { year, month });
    return {
      intent: `insights financeiros de ${monthLabel(year, month)}`,
      data: result,
    };
  }

  return null;
}

/** Fallback sem IA — texto em tópicos. */
export function formatDirectResponse(prefetch: PrefetchResult): string {
  const { intent, data } = prefetch;

  if (intent.includes("resumo financeiro")) {
    const d = data as {
      incomeFormatted?: string;
      expenseFormatted?: string;
      balanceFormatted?: string;
      income?: number;
      expense?: number;
      balance?: number;
      transactionCount?: number;
    };
    return (
      `${intent}:\n` +
      `• Receitas: ${d.incomeFormatted ?? formatBRL(d.income ?? 0)}\n` +
      `• Despesas: ${d.expenseFormatted ?? formatBRL(d.expense ?? 0)}\n` +
      `• Saldo: ${d.balanceFormatted ?? formatBRL(d.balance ?? 0)}\n` +
      `• Transações: ${d.transactionCount ?? 0}`
    );
  }

  if (intent.includes("últimos")) {
    const rows = (data as {
      months?: Array<{ year: number; month: number; balanceFormatted?: string; balance?: number }>;
    })?.months ?? [];
    if (rows.length === 0) return "Não encontrei histórico de saldo para o período.";
    return (
      `${intent}:\n` +
      rows
        .map(
          (r) =>
            `• ${monthLabel(r.year, r.month)}: ${r.balanceFormatted ?? formatBRL(r.balance ?? 0)}`
        )
        .join("\n")
    );
  }

  return `Consulta: ${intent}\n\n${JSON.stringify(data, null, 2).slice(0, 1200)}`;
}
