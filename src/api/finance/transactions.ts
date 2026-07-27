/** Fatia de @/api/finance — Fase G. */
import {
  Transaction,
  TransactionCreateRequest,
  ValueByNatureYearMonth,
} from "@/types/finance";
import type { PaginatedResult } from "@/types/pagination";
import { countsAsMonthlySpend } from "@/domain/finance/spendFlags";
import { asOne, getCurrentUserId, supabase } from "./_shared";


const TRANSACTION_SELECT =
  "*, class:class_id(id, name, type:type_id(name, hex_color, lucide_icon, exclude_from_spend, nature:nature_id(name)))";

export interface TransactionQueryOptions {
  page?: number;
  pageSize?: number;
  startDate?: string | null;
  endDate?: string | null;
  search?: string;
  nature?: "Receita" | "Despesa" | "Investimento" | null;
}

async function getClassIdsForNature(
  natureName: "Receita" | "Despesa" | "Investimento"
): Promise<number[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("class")
    .select("id, type:type_id(nature:nature_id(name))")
    .eq("user_id", userId);

  if (error) throw new Error(error.message);

  return (data ?? [])
    .filter((item) => {
      const type = item.type as { nature?: { name?: string } } | null;
      return type?.nature?.name === natureName;
    })
    .map((item) => item.id);
}

async function getClassIdsForSearch(term: string): Promise<number[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("class")
    .select("id, name, type:type_id(name)")
    .eq("user_id", userId);

  if (error) throw new Error(error.message);

  const lower = term.toLowerCase();
  return (data ?? [])
    .filter((item) => {
      const type = item.type as { name?: string } | null;
      return (
        item.name.toLowerCase().includes(lower) ||
        type?.name?.toLowerCase().includes(lower)
      );
    })
    .map((item) => item.id);
}

export async function fetchTransactionsQuery(
  options: TransactionQueryOptions = {}
): Promise<PaginatedResult<Transaction>> {
  const userId = await getCurrentUserId();
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 10;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let classIds: number[] | null = null;

  if (options.nature) {
    classIds = await getClassIdsForNature(options.nature);
    if (classIds.length === 0) {
      return { data: [], total: 0, page, pageSize, totalPages: 0 };
    }
  }

  let query = supabase
    .from("transaction")
    .select(TRANSACTION_SELECT, { count: "exact" })
    .eq("user_id", userId)
    .order("id", { ascending: false });

  if (options.startDate) {
    query = query.gte("transaction_at", options.startDate);
  }
  if (options.endDate) {
    query = query.lte("transaction_at", options.endDate);
  }
  if (classIds) {
    query = query.in("class_id", classIds);
  }

  const searchTerm = options.search?.trim();
  if (searchTerm) {
    const matchingClassIds = await getClassIdsForSearch(searchTerm);
    const pattern = `%${searchTerm}%`;

    if (matchingClassIds.length > 0) {
      query = query.or(
        `description.ilike.${pattern},class_id.in.(${matchingClassIds.join(",")})`
      );
    } else {
      query = query.ilike("description", pattern);
    }
  }

  query = query.range(from, to);

  const { data, error, count } = await query;

  if (error) throw error;

  const total = count ?? 0;

  return {
    data: data || [],
    total,
    page,
    pageSize,
    totalPages: total > 0 ? Math.ceil(total / pageSize) : 0,
  };
}

/** Data da última transação (para nudge de retenção). */
export async function fetchLatestTransactionAt(): Promise<string | null> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("transaction")
    .select("transaction_at")
    .eq("user_id", userId)
    .order("transaction_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.transaction_at ?? null;
}

export async function fetchTransactions(
  page: number = 1,
  pageSize: number = 10,
  startDateTZString: string | null = null,
  endDateTZString: string | null = null
): Promise<Transaction[]> {
  const result = await fetchTransactionsQuery({
    page,
    pageSize,
    startDate: startDateTZString,
    endDate: endDateTZString,
  });
  return result.data;
}


export async function fetchValueByNatureYearMonth(): Promise<
  ValueByNatureYearMonth[]
> {
  const { data, error } = await supabase
    .from("vw_value_by_nature_year_month")
    .select("year, month, receita_total, despesa_total");

  if (error) throw new Error(error.message);

  const rows = data || [];
  if (rows.length === 0) return [];

  const spendByMonth = await sumSpendDespesaGrouped(
    rows.map((row) => ({ year: row.year, month: row.month }))
  );

  return rows.map((row) => ({
    ...row,
    despesa_total:
      spendByMonth.get(`${row.year}-${row.month}`) ?? 0,
  }));
}

export async function fetchValueByNatureForMonth(
  year: number,
  month: number
): Promise<ValueByNatureYearMonth | null> {
  const { data, error } = await supabase
    .from("vw_value_by_nature_year_month")
    .select("year, month, receita_total, despesa_total")
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    ...data,
    despesa_total: await sumSpendDespesaForMonth(year, month),
  };
}

function monthKey(year: number, month: number): string {
  return `${year}-${month}`;
}

/** Uma query para todos os meses do gráfico (evita N+1 no dashboard). */
async function sumSpendDespesaGrouped(
  months: { year: number; month: number }[]
): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  if (months.length === 0) return totals;

  const sorted = [...months].sort(
    (a, b) => a.year - b.year || a.month - b.month
  );
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const start = `${first.year}-${String(first.month).padStart(2, "0")}-01`;
  const lastDay = new Date(last.year, last.month, 0).getDate();
  const end = `${last.year}-${String(last.month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("transaction")
    .select(
      "value, transaction_at, class:class_id(type:type_id(exclude_from_spend, nature:nature_id(name)))"
    )
    .eq("user_id", userId)
    .gte("transaction_at", start)
    .lte("transaction_at", `${end}T23:59:59.999Z`);

  if (error) {
    if (/exclude_from_spend/i.test(error.message)) {
      for (const m of months) {
        totals.set(
          monthKey(m.year, m.month),
          await sumLegacyDespesaForMonth(
            userId,
            `${m.year}-${String(m.month).padStart(2, "0")}-01`,
            `${m.year}-${String(m.month).padStart(2, "0")}-${String(new Date(m.year, m.month, 0).getDate()).padStart(2, "0")}`
          )
        );
      }
      return totals;
    }
    throw new Error(error.message);
  }

  for (const row of data ?? []) {
    const rawAt = String(row.transaction_at ?? "");
    const datePart = rawAt.slice(0, 10);
    const [y, mo] = datePart.split("-").map(Number);
    if (!y || !mo) continue;

    const cls = asOne(
      row.class as
        | {
            type?: {
              exclude_from_spend?: boolean;
              nature?: { name?: string };
            } | null;
          }
        | {
            type?: {
              exclude_from_spend?: boolean;
              nature?: { name?: string };
            } | null;
          }[]
        | null
    );
    const type = cls?.type ?? null;
    if (!countsAsMonthlySpend(type?.nature?.name, type)) continue;

    const key = monthKey(y, mo);
    totals.set(key, (totals.get(key) ?? 0) + Math.abs(Number(row.value) || 0));
  }

  return totals;
}

/**
 * Gasto do mês: só natureza Despesa que conta (Investimento e
 * exclude_from_spend ficam de fora).
 */
async function sumSpendDespesaForMonth(
  year: number,
  month: number
): Promise<number> {
  const grouped = await sumSpendDespesaGrouped([{ year, month }]);
  return grouped.get(monthKey(year, month)) ?? 0;
}

async function sumLegacyDespesaForMonth(
  userId: string,
  start: string,
  end: string
): Promise<number> {
  const { data, error } = await supabase
    .from("transaction")
    .select("value, class:class_id(type:type_id(nature:nature_id(name)))")
    .eq("user_id", userId)
    .gte("transaction_at", start)
    .lte("transaction_at", `${end}T23:59:59.999Z`);
  if (error) throw new Error(error.message);
  return (data ?? []).reduce((sum, row) => {
    const nature = (
      row.class as { type?: { nature?: { name?: string } } | null } | null
    )?.type?.nature?.name;
    if (nature !== "Despesa") return sum;
    return sum + Math.abs(Number(row.value) || 0);
  }, 0);
}

export async function insertTransaction(
  newTransaction: TransactionCreateRequest
): Promise<number> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("transaction")
    .insert([{ ...newTransaction, user_id: userId }])
    .select("id")
    .single();

  if (error) throw error;
  return data.id as number;
}

export async function createTransactionApi(
  newTransaction: TransactionCreateRequest
): Promise<{ queued: boolean }> {
  const { isNavigatorOffline } = await import("@/lib/offlineCache");
  if (isNavigatorOffline()) {
    const { enqueueOfflineTransaction } = await import("@/lib/offlineOutbox");
    enqueueOfflineTransaction(newTransaction);
    return { queued: true };
  }

  await insertTransaction(newTransaction);
  try {
    const { markFirstTxDone } = await import("@/lib/onboarding");
    const { track } = await import("@/lib/analytics");
    const userId = await getCurrentUserId();
    markFirstTxDone(userId);
    track("first_transaction", { source: "create" });
  } catch {
    /* ignore onboarding side-effects */
  }
  return { queued: false };
}

export async function deleteTransactionApi(transactionId: number) {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("transaction")
    .delete()
    .eq("id", transactionId)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function updateTransactionApi(
  transactionId: string,
  updatedTransaction: TransactionCreateRequest
) {
  const userId = await getCurrentUserId();
  const transactionPayload = {
    ...updatedTransaction,
    value:
      typeof updatedTransaction.value === "string"
        ? parseFloat(updatedTransaction.value)
        : updatedTransaction.value,
  };

  const { error } = await supabase
    .from("transaction")
    .update(transactionPayload)
    .eq("id", transactionId)
    .eq("user_id", userId);

  if (error) {
    throw error;
  }
}


