import { getCurrentUserId } from "@/lib/auth-user";
import { supabase } from "@/lib/supabase";
import type {
  LedgerTransaction,
  MonthlyBudgetSummary,
  ValueByNatureYearMonth,
  ValueByTypeMonth,
} from "@/types/finance";

export { fetchRecurringForDashboard } from "@/api/finance/recurring";

export async function fetchValueByNatureForMonth(
  year: number,
  month: number
): Promise<ValueByNatureYearMonth | null> {
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "get_value_by_nature_for_month",
    { p_year: year, p_month: month }
  );

  if (!rpcError) {
    const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    if (!row) return null;
    return {
      year: Number(row.year),
      month: Number(row.month),
      receita_total: Number(row.receita_total) || 0,
      despesa_total: Number(row.despesa_total) || 0,
    };
  }

  const { data, error } = await supabase
    .from("vw_value_by_nature_year_month")
    .select("year, month, receita_total, despesa_total")
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    year: Number(data.year),
    month: Number(data.month),
    receita_total: Number(data.receita_total) || 0,
    despesa_total: Number(data.despesa_total) || 0,
  };
}

export async function fetchValueByTypeForMonth(
  year: number,
  month: number
): Promise<ValueByTypeMonth[]> {
  const { data, error } = await supabase.rpc("get_value_by_type_for_month", {
    p_year: year,
    p_month: month,
  });
  if (error) throw new Error(error.message);
  if (!Array.isArray(data)) return [];
  return data.map((row) => ({
    nature_name: String(row.nature_name ?? ""),
    type_name: String(row.type_name ?? ""),
    type_color: (row.type_color as string | null) ?? null,
    total_value: Number(row.total_value) || 0,
  }));
}

export async function fetchMonthlyBudgetSummary(
  budgetMonth: string
): Promise<MonthlyBudgetSummary[]> {
  const { data, error } = await supabase
    .from("vw_monthly_budget_summary")
    .select(
      "id, type_id, type_name, class_id, class_name, nature_name, expense_value, income_value, planned_value, spent_value, remaining_value, percentage_used, status"
    )
    .eq("budget_month", budgetMonth)
    .order("type_name", { ascending: true });

  if (error) throw new Error(error.message);
  return (data || []) as MonthlyBudgetSummary[];
}

export async function fetchValueByNatureYearMonth(): Promise<
  ValueByNatureYearMonth[]
> {
  const { data, error } = await supabase
    .from("vw_value_by_nature_year_month")
    .select("year, month, receita_total, despesa_total")
    .order("year", { ascending: true })
    .order("month", { ascending: true });

  if (error) throw new Error(error.message);
  return (data || []).map((row) => ({
    year: Number(row.year),
    month: Number(row.month),
    receita_total: Number(row.receita_total) || 0,
    despesa_total: Number(row.despesa_total) || 0,
  }));
}

export function budgetMonthIso(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

const LEDGER_SELECT =
  "id, value, description, transaction_at, class_id, class:class_id(id, name, type:type_id(name, hex_color, lucide_icon, nature:nature_id(name)))";

export async function fetchMonthLedger(
  year: number,
  month: number
): Promise<LedgerTransaction[]> {
  const userId = await getCurrentUserId();
  const lastDay = new Date(year, month, 0).getDate();
  const start = `${year}-${String(month).padStart(2, "0")}-01T00:00:00.000Z`;
  const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}T23:59:59.999Z`;

  const { data, error } = await supabase
    .from("transaction")
    .select(LEDGER_SELECT)
    .eq("user_id", userId)
    .gte("transaction_at", start)
    .lte("transaction_at", end)
    .order("id", { ascending: false })
    .limit(500);

  if (error) throw new Error(error.message);
  return (data || []) as unknown as LedgerTransaction[];
}

export async function fetchLatestTransactionAt(): Promise<string | null> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("transaction")
    .select("transaction_at")
    .eq("user_id", userId)
    .order("transaction_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.transaction_at ?? null;
}

export async function fetchLedgerBetween(
  startDate: string,
  endDate: string
): Promise<LedgerTransaction[]> {
  const userId = await getCurrentUserId();
  const start = `${startDate}T00:00:00.000Z`;
  const end = `${endDate}T23:59:59.999Z`;

  const { data, error } = await supabase
    .from("transaction")
    .select(LEDGER_SELECT)
    .eq("user_id", userId)
    .gte("transaction_at", start)
    .lte("transaction_at", end)
    .order("id", { ascending: false })
    .limit(200);

  if (error) throw new Error(error.message);
  return (data || []) as unknown as LedgerTransaction[];
}
