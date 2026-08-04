/** Fatia de @/api/finance — Fase G. */
import {
  Transaction,
  TransactionCreateRequest,
  ValueByNatureYearMonth,
  ValueByTypeMonth,
} from "@/types/finance";
import type { PaginatedResult } from "@/types/pagination";
import { getCurrentUserId, supabase } from "./_shared";
import { fetchDimensionsCached } from "./dimensionsCache";

const TRANSACTION_SELECT =
  "id, value, description, transaction_at, recurring_transaction_id, installment_number, paid_at, class_id, class:class_id(id, name, type:type_id(name, hex_color, lucide_icon, exclude_from_spend, nature:nature_id(name)))";

/** Select enxuto para projeção / agregados (sem campos de UI). */
const LEDGER_LEAN_SELECT =
  "id, value, description, transaction_at, recurring_transaction_id, class:class_id(type:type_id(name, exclude_from_spend, nature:nature_id(name)))";

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
  const dims = await fetchDimensionsCached();
  const nature = dims.find((d) => d.name === natureName);
  if (!nature) return [];
  return nature.types.flatMap((t) => t.classes.map((c) => c.id));
}

async function getClassIdsForSearch(term: string): Promise<number[]> {
  const dims = await fetchDimensionsCached();
  const lower = term.toLowerCase();
  const ids: number[] = [];
  for (const nature of dims) {
    for (const type of nature.types) {
      const typeMatch = type.name.toLowerCase().includes(lower);
      for (const cls of type.classes) {
        if (typeMatch || cls.name.toLowerCase().includes(lower)) {
          ids.push(cls.id);
        }
      }
    }
  }
  return ids;
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
    data: (data || []) as unknown as Transaction[],
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

export async function fetchValueByNatureForMonth(
  year: number,
  month: number
): Promise<ValueByNatureYearMonth | null> {
  // Prefer RPC (SQL) — fallback na view se a migration ainda não estiver aplicada.
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

/** Totais por tipo (categoria) no mês — donuts do dashboard. */
export async function fetchValueByTypeForMonth(
  year: number,
  month: number
): Promise<ValueByTypeMonth[]> {
  const { data, error } = await supabase.rpc("get_value_by_type_for_month", {
    p_year: year,
    p_month: month,
  });

  if (error) {
    // Fallback: agrega no client a partir das txs do mês (até 500).
    const lastDay = new Date(year, month, 0).getDate();
    const start = `${year}-${String(month).padStart(2, "0")}-01T00:00:00.000Z`;
    const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}T23:59:59.999Z`;
    const txs = await fetchTransactions(1, 500, start, end);
    const map = new Map<string, ValueByTypeMonth>();
    for (const tx of txs) {
      const nature = tx.class?.type?.nature?.name;
      const typeName = tx.class?.type?.name;
      if (!nature || !typeName) continue;
      if (
        nature === "Despesa" &&
        tx.class?.type?.exclude_from_spend
      ) {
        continue;
      }
      const key = `${nature}::${typeName}`;
      const prev = map.get(key);
      const raw = Number(tx.value) || 0;
      const add = nature === "Despesa" ? Math.abs(raw) : raw;
      if (prev) {
        prev.total_value += add;
      } else {
        map.set(key, {
          nature_name: nature,
          type_name: typeName,
          type_color: tx.class?.type?.hex_color ?? null,
          total_value: add,
        });
      }
    }
    return Array.from(map.values());
  }

  return (data ?? []).map((row: {
    nature_name: string;
    type_name: string;
    type_color: string | null;
    total_value: number;
  }) => ({
    nature_name: String(row.nature_name),
    type_name: String(row.type_name),
    type_color: row.type_color,
    total_value: Number(row.total_value) || 0,
  }));
}

/**
 * Lançamentos avulsos (sem recorrência) num intervalo — projeção.
 * Pagina até esgotar; select enxuto.
 */
export async function fetchAvulsoLedgerInRange(
  startDate: string,
  endDate: string
): Promise<
  Array<{
    id: number;
    value: number;
    description: string;
    transaction_at: string;
    recurring_transaction_id?: string | null;
    class?: Transaction["class"];
  }>
> {
  const userId = await getCurrentUserId();
  const pageSize = 500;
  const rows: Array<{
    id: number;
    value: number;
    description: string;
    transaction_at: string;
    recurring_transaction_id?: string | null;
    class?: Transaction["class"];
  }> = [];

  for (let page = 0; ; page++) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("transaction")
      .select(LEDGER_LEAN_SELECT)
      .eq("user_id", userId)
      .is("recurring_transaction_id", null)
      .gte("transaction_at", startDate)
      .lte("transaction_at", endDate)
      .order("transaction_at", { ascending: true })
      .range(from, to);

    if (error) throw new Error(error.message);
    const batch = (data ?? []) as unknown as typeof rows;
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }

  return rows;
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

/** class_id (+ type_id) de uma transação — para pré-preencher edição. */
export async function fetchTransactionClassMeta(
  transactionId: number
): Promise<{ class_id: number; type_id: number | null } | null> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("transaction")
    .select("class_id, class:class_id(type_id)")
    .eq("id", transactionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.class_id) return null;
  const classRel = data.class as { type_id?: number } | null;
  return {
    class_id: data.class_id as number,
    type_id: classRel?.type_id ?? null,
  };
}

/** Subcategorias mais usadas nos lançamentos (para sugestões do picker). */
export async function fetchMostUsedClassIds(
  limit = 12,
  natureName?: string | null
): Promise<number[]> {
  const userId = await getCurrentUserId();
  const natureFilter = natureName?.trim().toLowerCase() || null;

  const { data, error } = await supabase
    .from("transaction")
    .select(
      "class_id, class:class_id(type:type_id(nature:nature_id(name)))"
    )
    .eq("user_id", userId)
    .not("class_id", "is", null)
    .order("transaction_at", { ascending: false })
    .limit(500);

  if (error) throw new Error(error.message);

  const counts = new Map<number, number>();
  for (const row of data ?? []) {
    const id = row.class_id as number | null;
    if (id == null) continue;

    if (natureFilter) {
      const classRel = row.class as {
        type?: { nature?: { name?: string } | null } | null;
      } | null;
      const name = classRel?.type?.nature?.name?.toLowerCase() ?? "";
      if (name !== natureFilter) continue;
    }

    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);
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


