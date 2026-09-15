import { getCurrentUserId } from "@/lib/auth-user";
import { supabase } from "@/lib/supabase";
import type {
  PaginatedResult,
  Transaction,
  TransactionCreateRequest,
} from "@/types/finance";

import {
  classIdsForNature,
  classIdsForSearch,
  fetchDimensions,
} from "./dimensions";

const TRANSACTION_SELECT =
  "id, value, description, transaction_at, recurring_transaction_id, installment_number, class_id, class:class_id(id, name, type:type_id(name, hex_color, lucide_icon, nature:nature_id(name)))";

export type NatureFilter = "Receita" | "Despesa" | "Investimento";

export interface TransactionQueryOptions {
  page?: number;
  pageSize?: number;
  startDate?: string | null;
  endDate?: string | null;
  search?: string;
  nature?: NatureFilter | null;
}

export function monthDateRange(year: number, month: number): {
  start: string;
  end: string;
} {
  const lastDay = new Date(year, month, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    start: `${year}-${pad(month)}-01T00:00:00.000Z`,
    end: `${year}-${pad(month)}-${pad(lastDay)}T23:59:59.999Z`,
  };
}

export function shiftYearMonth(
  year: number,
  month: number,
  delta: number
): { year: number; month: number } {
  const d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export function todayIsoDate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export async function fetchTransactionsQuery(
  options: TransactionQueryOptions = {}
): Promise<PaginatedResult<Transaction>> {
  const userId = await getCurrentUserId();
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let classIds: number[] | null = null;
  const searchTerm = options.search?.trim() ?? "";
  const needsDimensions = Boolean(options.nature) || Boolean(searchTerm);
  const dimensions = needsDimensions ? await fetchDimensions() : [];

  if (options.nature) {
    classIds = classIdsForNature(dimensions, options.nature);
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

  if (searchTerm) {
    const matchingClassIds = classIdsForSearch(dimensions, searchTerm);
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
  if (error) throw new Error(error.message);

  const total = count ?? 0;
  return {
    data: (data || []) as unknown as Transaction[],
    total,
    page,
    pageSize,
    totalPages: total > 0 ? Math.ceil(total / pageSize) : 0,
  };
}

export async function fetchTransactionById(
  transactionId: number
): Promise<Transaction | null> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("transaction")
    .select(TRANSACTION_SELECT)
    .eq("id", transactionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as Transaction) ?? null;
}

export async function createTransaction(
  payload: TransactionCreateRequest
): Promise<number> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("transaction")
    .insert([{ ...payload, user_id: userId }])
    .select("id")
    .single();
  if (error) throw error;
  return data.id as number;
}

export async function updateTransaction(
  transactionId: number,
  payload: TransactionCreateRequest
): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("transaction")
    .update(payload)
    .eq("id", transactionId)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function deleteTransaction(transactionId: number): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("transaction")
    .delete()
    .eq("id", transactionId)
    .eq("user_id", userId);
  if (error) throw error;
}

/** Subcategorias mais usadas nos lançamentos (sugestões do picker). */
export async function fetchMostUsedClassIds(
  limit = 12,
  natureName?: string | null
): Promise<number[]> {
  const userId = await getCurrentUserId();
  const natureFilter = natureName?.trim().toLowerCase() || null;

  const { data, error } = await supabase
    .from("transaction")
    .select("class_id, class:class_id(type:type_id(nature:nature_id(name)))")
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

const AVULSO_SELECT =
  "id, value, description, transaction_at, recurring_transaction_id, class:class_id(id, name, type:type_id(name, exclude_from_spend, nature:nature_id(name)))";

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
  const { data, error } = await supabase
    .from("transaction")
    .select(AVULSO_SELECT)
    .eq("user_id", userId)
    .is("recurring_transaction_id", null)
    .gte("transaction_at", startDate)
    .lte("transaction_at", endDate)
    .order("transaction_at", { ascending: true })
    .limit(1000);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Array<{
    id: number;
    value: number;
    description: string;
    transaction_at: string;
    recurring_transaction_id?: string | null;
    class?: Transaction["class"];
  }>;
}
