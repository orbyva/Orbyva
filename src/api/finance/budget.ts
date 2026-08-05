/** Fatia de @/api/finance — Fase G. */
import {
  MonthlyBudget,
  MonthlyBudgetCreateRequest,
  MonthlyBudgetUpdateRequest,
  MonthlyBudgetSummary,
  MonthlyBudgetSuggestion,
} from "@/types/finance";
import { getCurrentUserId, supabase } from "./_shared";

export async function fetchMonthlyBudgets(
  budgetMonth: string,
  userId?: string
): Promise<MonthlyBudget[]> {
  const uid = userId ?? (await getCurrentUserId());
  const { data, error } = await supabase
    .from("monthly_budget")
    .select(`
      *,
      type:type_id(id, name, hex_color, lucide_icon),
      class:class_id(id, name)
    `)
    .eq("user_id", uid)
    .eq("budget_month", budgetMonth)
    .order("id", { ascending: false });

  if (error) throw new Error(error.message);

  return data || [];
}

export async function createMonthlyBudgetApi(
  newBudget: MonthlyBudgetCreateRequest
): Promise<void> {
  const userId = await getCurrentUserId();

  if (newBudget.type_id && !newBudget.class_id) {
  const { data: existingParents, error: parentError } = await supabase
    .from("monthly_budget")
    .select("id, planned_value")
    .eq("user_id", userId)
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
      .eq("id", existingParent.id)
      .eq("user_id", userId);

    if (error) throw error;

    return;
  }
}

  const { error } = await supabase
    .from("monthly_budget")
    .insert([{ ...newBudget, user_id: userId }]);

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
  const userId = await getCurrentUserId();
  const { id, ...updateFields } = updateData;

  const { data: oldBudget, error: oldError } = await supabase
    .from("monthly_budget")
    .select("type_id, class_id, budget_month")
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (oldError) throw oldError;

  const { error } = await supabase
    .from("monthly_budget")
    .update(updateFields)
    .eq("id", id)
    .eq("user_id", userId);

  if (error) throw error;

  const typeId = updateData.type_id ?? oldBudget.type_id;
  const budgetMonth = updateData.budget_month ?? oldBudget.budget_month;
  const classId = updateData.class_id ?? oldBudget.class_id;

  if (typeId && classId) {
    await syncParentMonthlyBudget(typeId, budgetMonth);
  }
}

export async function deleteMonthlyBudgetApi(budgetId: number): Promise<void> {
  const userId = await getCurrentUserId();
  const { data: oldBudget, error: oldError } = await supabase
    .from("monthly_budget")
    .select("id, type_id, class_id, budget_month")
    .eq("id", budgetId)
    .eq("user_id", userId)
    .single();

  if (oldError) throw oldError;

  // Se deletar o pai, deleta pai + filhos do mesmo tipo/mês
  if (oldBudget.type_id && oldBudget.class_id === null) {
    const { error } = await supabase
      .from("monthly_budget")
      .delete()
      .eq("user_id", userId)
      .eq("type_id", oldBudget.type_id)
      .eq("budget_month", oldBudget.budget_month);

    if (error) throw error;

    return;
  }

  const { error } = await supabase
    .from("monthly_budget")
    .delete()
    .eq("id", budgetId)
    .eq("user_id", userId);

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
    .select(
      "id, user_id, type_id, type_name, class_id, class_name, nature_name, expense_value, income_value, budget_month, planned_value, spent_value, remaining_value, percentage_used, status"
    )
    .eq("budget_month", budgetMonth)
    .order("type_name", { ascending: true });

  if (error) throw new Error(error.message);

  return data || [];
}

async function syncParentMonthlyBudget(
  typeId: number,
  budgetMonth: string
): Promise<void> {
  const userId = await getCurrentUserId();
  const { data: children, error: childrenError } = await supabase
    .from("monthly_budget")
    .select("planned_value")
    .eq("user_id", userId)
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
    .eq("user_id", userId)
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
        user_id: userId,
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
      .eq("id", parent.id)
      .eq("user_id", userId);

    if (error) throw error;
  }
}

export type DuplicateBudgetMode = "missing_only" | "replace";

export async function duplicateMonthlyBudgetApi(
  fromBudgetMonth: string,
  toBudgetMonths: string[],
  mode: DuplicateBudgetMode
): Promise<void> {
  const userId = await getCurrentUserId();
  const { data: sourceBudgets, error: fetchError } = await supabase
    .from("monthly_budget")
    .select("type_id, class_id, planned_value")
    .eq("user_id", userId)
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
        .eq("user_id", userId)
        .eq("budget_month", toBudgetMonth);

      if (deleteError) throw deleteError;
    }

    if (mode === "missing_only") {
      const { data: existingBudgets, error: existingError } = await supabase
        .from("monthly_budget")
        .select("type_id, class_id")
        .eq("user_id", userId)
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
          user_id: userId,
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
      user_id: userId,
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
