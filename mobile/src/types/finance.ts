export interface ValueByNatureYearMonth {
  year: number;
  month: number;
  receita_total: number;
  despesa_total: number;
}

export interface ValueByTypeMonth {
  nature_name: string;
  type_name: string;
  type_color: string | null;
  total_value: number;
}

export interface MonthlyBudgetSummary {
  id: number;
  type_id: number;
  type_name: string;
  class_id: number | null;
  class_name: string | null;
  nature_name: string;
  expense_value?: number;
  income_value?: number;
  planned_value: number;
  spent_value: number;
  remaining_value: number;
  percentage_used: number;
  status: string;
}

export function sumExpenseBudgetCeiling(rows: MonthlyBudgetSummary[]): number {
  const expenses = rows.filter((b) => /despesa/i.test(b.nature_name || ""));
  const parents = expenses.filter((b) => b.class_id == null);
  const list = parents.length > 0 ? parents : expenses;
  return list.reduce((s, b) => s + Number(b.planned_value || 0), 0);
}

export interface Transaction {
  id: number;
  value: number;
  description: string;
  transaction_at: string;
  class: {
    id: number;
    name: string;
    type?: {
      name: string;
      hex_color: string | null;
      lucide_icon?: string | null;
      nature?: { name: string } | null;
    } | null;
  };
  recurring_transaction_id?: string | null;
  installment_number?: number | null;
}

export type LedgerTransaction = Transaction;

export interface TransactionCreateRequest {
  value: number;
  class_id: number;
  description: string;
  transaction_at: string;
  recurring_transaction_id?: string | null;
  installment_number?: number | null;
  paid_at?: string | null;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
