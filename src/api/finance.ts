import { supabase } from "@/lib/supabase";
import {
  Class, ClassCreateRequest,
  ClassUpdateRequest,
  Nature,
  Transaction,
  TransactionCreateRequest,
  Type,
  TypeCreateRequest,
  TypeUpdateRequest,
  MonthlyBudget,
  MonthlyBudgetCreateRequest,
  MonthlyBudgetUpdateRequest,
  MonthlyBudgetSummary,
  MonthlyBudgetSuggestion,
  ValueByNatureYearMonth,
} from "@/types/finance";
import type { Dimension } from "@/types/dimensions";
import type { PaginatedResult } from "@/types/pagination";

export type { Dimension } from "@/types/dimensions";

const TRANSACTION_SELECT =
  "*, class:class_id(id, name, type:type_id(name, hex_color, lucide_icon, nature:nature_id(name)))";

export interface TransactionQueryOptions {
  page?: number;
  pageSize?: number;
  startDate?: string | null;
  endDate?: string | null;
  search?: string;
  nature?: "Receita" | "Despesa" | null;
}

async function getClassIdsForNature(
  natureName: "Receita" | "Despesa"
): Promise<number[]> {
  const { data, error } = await supabase
    .from("class")
    .select("id, type:type_id(nature:nature_id(name))");

  if (error) throw new Error(error.message);

  return (data ?? [])
    .filter((item) => {
      const type = item.type as { nature?: { name?: string } } | null;
      return type?.nature?.name === natureName;
    })
    .map((item) => item.id);
}

async function getClassIdsForSearch(term: string): Promise<number[]> {
  const { data, error } = await supabase
    .from("class")
    .select("id, name, type:type_id(name)");

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

export async function fetchNatures(): Promise<Nature[]> {
  const { data, error } = await supabase
    .from("nature")
    .select("id, name");
  if (error) throw new Error(error.message);
  return data || [];
}

// Type

export async function fetchTypes(): Promise<Type[]> {
  const { data, error } = await supabase
    .from('type')
    .select(`
      *,
      nature:nature_id(name)
    `)


  if (error) throw new Error(error.message);

  return data || []
}

export async function createTypeApi(newType: TypeCreateRequest): Promise<void> {
  if (!newType.order) {
    const { data, error: fetchError } = await supabase
      .from('type')
      .select('order')
      .order('order', { ascending: false })
      .limit(1);

    if (fetchError) throw fetchError;

    const lastOrder = data && data.length > 0 ? data[0].order : 0;
    newType.order = lastOrder + 1;
  }

  const { error } = await supabase
    .from('type')
    .insert([newType])

  if (error) throw error;
}

export async function updateTypeApi(updateData: TypeUpdateRequest): Promise<void> {
  const { id, ...updateFields } = updateData;

  const { error } = await supabase
    .from('type')
    .update(updateFields)
    .eq('id', id)

  if (error) throw error;
}

export async function deleteTypeApi(typeId: number): Promise<void> {
  const { error } = await supabase
    .from("type")
    .delete()
    .match({ id: typeId });
  if (error) throw error;
}

// Class

export async function fetchClasses(): Promise<Class[]> {
  const { data, error } = await supabase
    .from("class")
    .select(`
      *,
      type:type_id(name, nature:nature_id(name))
    `)

  if (error) throw new Error(error.message);

  return data || [];
}


export async function createClassApi(newClass: ClassCreateRequest): Promise<void> {
  const { error } = await supabase
    .from('class')
    .insert([newClass])

  if (error) throw error;
}

export async function updateClassApi(updateData: ClassUpdateRequest): Promise<void> {
  const { id, ...updateFields } = updateData;

  const { error } = await supabase
    .from('class')
    .update(updateFields)
    .eq('id', id)

  if (error) throw error;
}
export async function deleteClassApi(classId: number): Promise<void> {
  const { error } = await supabase
    .from("class")
    .delete()
    .match({ id: classId });
  if (error) throw error;
}

// Nature

export async function deleteNatureApi(natureId: number): Promise<void> {
  const { error } = await supabase
    .from("nature")
    .delete()
    .match({ id: natureId });
  if (error) throw error;
}



export async function fetchDimensions(): Promise<Dimension[]> {
  const { data, error } = await supabase
    .from("nature")
    .select(`
      id,
      name,
      types: type!nature_id (
        id,
        name,
        classes: class!type_id (
          id,
          name
        )
      )
    `);

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function fetchValueByNatureYearMonth(): Promise<
  ValueByNatureYearMonth[]
> {
  const { data, error } = await supabase
    .from("vw_value_by_nature_year_month")
    .select("year, month, receita_total, despesa_total");

  if (error) throw new Error(error.message);

  return data || [];
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

  return data;
}

export async function createTransactionApi(newTransaction: TransactionCreateRequest) {
  const { error } = await supabase.from("transaction").insert([newTransaction]);
  if (error) throw error;
}

export async function deleteTransactionApi(transactionId: number) {
  const { error } = await supabase
    .from("transaction")
    .delete()
    .match({ id: transactionId });
  if (error) throw error;
}

export async function updateTransactionApi(
  transactionId: string,
  updatedTransaction: TransactionCreateRequest
) {
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
    .match({ id: transactionId });

  if (error) {
    throw error;
  }
}

// Monthly Budget
export async function fetchMonthlyBudgets(
  budgetMonth: string,
  userId: string
): Promise<MonthlyBudget[]> {
  const { data, error } = await supabase
    .from("monthly_budget")
    .select(`
      *,
      type:type_id(id, name, hex_color, lucide_icon),
      class:class_id(id, name)
    `)
    .eq("user_id", userId)
    .eq("budget_month", budgetMonth)
    .order("id", { ascending: false });

  if (error) throw new Error(error.message);

  return data || [];
}

export async function createMonthlyBudgetApi(
  newBudget: MonthlyBudgetCreateRequest
): Promise<void> {
  if (newBudget.type_id && !newBudget.class_id) {
  const { data: existingParents, error: parentError } = await supabase
    .from("monthly_budget")
    .select("id, planned_value")
    .eq("type_id", newBudget.type_id)
    .eq("budget_month", newBudget.budget_month)
    .is("class_id", null)
    .order("id", { ascending: true })
    .limit(1);

  if (parentError) throw parentError;

  const existingParent = existingParents?.[0];

  if (existingParent) {
    const newPlannedValue =
      Number(existingParent.planned_value || 0) +
      Number(newBudget.planned_value || 0);

    const { error } = await supabase
      .from("monthly_budget")
      .update({ planned_value: newPlannedValue })
      .eq("id", existingParent.id);

    if (error) throw error;

    return;
  }
}

  const { error } = await supabase
    .from("monthly_budget")
    .insert([newBudget]);

  if (error) throw error;

  if (newBudget.type_id && newBudget.class_id) {
    await syncParentMonthlyBudget(
      newBudget.type_id,
      newBudget.budget_month
    );
  }
}

export async function updateMonthlyBudgetApi(
  updateData: MonthlyBudgetUpdateRequest
): Promise<void> {
  const { id, ...updateFields } = updateData;

  const { data: oldBudget, error: oldError } = await supabase
    .from("monthly_budget")
    .select("type_id, class_id, budget_month")
    .eq("id", id)
    .single();

  if (oldError) throw oldError;

  const { error } = await supabase
    .from("monthly_budget")
    .update(updateFields)
    .eq("id", id);

  if (error) throw error;

  const typeId = updateData.type_id ?? oldBudget.type_id;
  const budgetMonth = updateData.budget_month ?? oldBudget.budget_month;
  const classId = updateData.class_id ?? oldBudget.class_id;

  if (typeId && classId) {
    await syncParentMonthlyBudget(typeId, budgetMonth);
  }
}

export async function deleteMonthlyBudgetApi(budgetId: number): Promise<void> {
  const { data: oldBudget, error: oldError } = await supabase
    .from("monthly_budget")
    .select("id, type_id, class_id, budget_month")
    .eq("id", budgetId)
    .single();

  if (oldError) throw oldError;

  // Se deletar o pai, deleta pai + filhos do mesmo tipo/mês
  if (oldBudget.type_id && oldBudget.class_id === null) {
    const { error } = await supabase
      .from("monthly_budget")
      .delete()
      .eq("type_id", oldBudget.type_id)
      .eq("budget_month", oldBudget.budget_month);

    if (error) throw error;

    return;
  }

  const { error } = await supabase
    .from("monthly_budget")
    .delete()
    .eq("id", budgetId);

  if (error) throw error;

  if (oldBudget.type_id && oldBudget.class_id) {
    await syncParentMonthlyBudget(
      oldBudget.type_id,
      oldBudget.budget_month
    );
  }
}

export async function fetchMonthlyBudgetSummary(
  budgetMonth: string
): Promise<MonthlyBudgetSummary[]> {
  const { data, error } = await supabase
    .from("vw_monthly_budget_summary")
    .select("*")
    .eq("budget_month", budgetMonth)
    .order("type_name", { ascending: true });

  if (error) throw new Error(error.message);

  return data || [];
}

async function syncParentMonthlyBudget(
  typeId: number,
  budgetMonth: string
): Promise<void> {
  const { data: children, error: childrenError } = await supabase
    .from("monthly_budget")
    .select("planned_value")
    .eq("type_id", typeId)
    .eq("budget_month", budgetMonth)
    .not("class_id", "is", null);

  if (childrenError) throw childrenError;

  const childrenTotal = (children || []).reduce(
    (acc, item) => acc + Number(item.planned_value || 0),
    0
  );

  const { data: parents, error: parentError } = await supabase
    .from("monthly_budget")
    .select("id, planned_value")
    .eq("type_id", typeId)
    .eq("budget_month", budgetMonth)
    .is("class_id", null)
    .order("id", { ascending: true })
    .limit(1);

  if (parentError) throw parentError;

  const parent = parents?.[0];

  if (!parent && childrenTotal > 0) {
    const { error } = await supabase.from("monthly_budget").insert([
      {
        type_id: typeId,
        class_id: null,
        budget_month: budgetMonth,
        planned_value: childrenTotal,
      },
    ]);

    if (error) throw error;
    return;
  }

  if (!parent) return;

  if (childrenTotal > Number(parent.planned_value || 0)) {
    const { error } = await supabase
      .from("monthly_budget")
      .update({ planned_value: childrenTotal })
      .eq("id", parent.id);

    if (error) throw error;
  }
}

export type DuplicateBudgetMode = "missing_only" | "replace";

export async function duplicateMonthlyBudgetApi(
  fromBudgetMonth: string,
  toBudgetMonths: string[],
  mode: DuplicateBudgetMode
): Promise<void> {
  const { data: sourceBudgets, error: fetchError } = await supabase
    .from("monthly_budget")
    .select("type_id, class_id, planned_value")
    .eq("budget_month", fromBudgetMonth);

  if (fetchError) throw fetchError;

  if (!sourceBudgets || sourceBudgets.length === 0) {
    throw new Error("Nenhum orçamento encontrado no mês de origem.");
  }

  for (const toBudgetMonth of toBudgetMonths) {
    if (mode === "replace") {
      const { error: deleteError } = await supabase
        .from("monthly_budget")
        .delete()
        .eq("budget_month", toBudgetMonth);

      if (deleteError) throw deleteError;
    }

    if (mode === "missing_only") {
      const { data: existingBudgets, error: existingError } = await supabase
        .from("monthly_budget")
        .select("type_id, class_id")
        .eq("budget_month", toBudgetMonth);

      if (existingError) throw existingError;

      const existingKeys = new Set(
        (existingBudgets || []).map(
          (item) => `${item.type_id}-${item.class_id ?? "null"}`
        )
      );

      const payload = sourceBudgets
        .filter(
          (budget) =>
            !existingKeys.has(`${budget.type_id}-${budget.class_id ?? "null"}`)
        )
        .map((budget) => ({
          type_id: budget.type_id,
          class_id: budget.class_id,
          budget_month: toBudgetMonth,
          planned_value: budget.planned_value,
        }));

      if (payload.length > 0) {
        const { error } = await supabase
          .from("monthly_budget")
          .insert(payload);

        if (error) throw error;
      }

      continue;
    }

    const payload = sourceBudgets.map((budget) => ({
      type_id: budget.type_id,
      class_id: budget.class_id,
      budget_month: toBudgetMonth,
      planned_value: budget.planned_value,
    }));

    const { error } = await supabase
      .from("monthly_budget")
      .insert(payload);

    if (error) throw error;
  }
}

export async function fetchMonthlyBudgetSuggestions(
  budgetMonth: string
): Promise<MonthlyBudgetSuggestion[]> {
  const { data, error } = await supabase.rpc(
    "get_monthly_budget_suggestions",
    {
      p_budget_month: budgetMonth,
    }
  );

  if (error) throw error;

  return data || [];
}