import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth-user";
import { asOne } from "@/api/finance/_shared";
import {
  matchesGoalAporte,
  matchesGoalMetaClass,
  resolveSyncedGoalProgress,
  sumAporteProgress,
} from "@/domain/goals/finance";
import type {
  PersonalGoal,
  PersonalGoalCreateRequest,
  PersonalGoalUpdateRequest,
} from "@/types/goals";

/** Soma lançamentos da meta (classe = título, ou `Meta - …` / descrição legado). */
export async function sumGoalAporteFromLedger(
  goalTitle: string
): Promise<number> {
  const title = goalTitle.trim();
  if (!title) return 0;

  const { data, error } = await supabase.rpc("get_goal_aporte_sum", {
    p_title: title,
  });

  if (!error) {
    return Math.abs(Number(data) || 0);
  }

  // Fallback se a migration ainda não estiver aplicada.
  const userId = await getCurrentUserId();
  const { data: rows, error: fallbackError } = await supabase
    .from("transaction")
    .select("value, description, class:class_id(name)")
    .eq("user_id", userId);

  if (fallbackError) throw new Error(fallbackError.message);
  return sumAporteProgress(
    (rows ?? []).map((row) => ({
      value: row.value,
      description: row.description,
      class: asOne(row.class as { name?: string } | { name?: string }[] | null),
    })),
    title
  );
}

/** Atualiza progresso das metas financeiras cujo aporte bate com a descrição/classe. */
export async function syncGoalsFromAporteDescription(
  description: string
): Promise<void> {
  const goals = await fetchGoals();
  for (const goal of goals) {
    if (goal.category !== "financial" || goal.status !== "active") continue;
    if (
      !matchesGoalAporte(description, goal.title) &&
      !matchesGoalMetaClass(description, goal.title)
    ) {
      continue;
    }
    const summed = await sumGoalAporteFromLedger(goal.title);
    const resolved = resolveSyncedGoalProgress(
      goal.current_value,
      summed,
      goal.target_value
    );
    if (!resolved.changed) continue;
    await updateGoal({
      id: goal.id,
      current_value: resolved.next,
    });
  }
}

export async function fetchGoals(): Promise<PersonalGoal[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("personal_goal")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createGoal(
  goal: PersonalGoalCreateRequest
): Promise<PersonalGoal> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("personal_goal")
    .insert([{ ...goal, user_id: userId }])
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateGoal(data: PersonalGoalUpdateRequest): Promise<void> {
  const userId = await getCurrentUserId();
  const { id, ...fields } = data;
  const { error } = await supabase
    .from("personal_goal")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function deleteGoal(id: string): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("personal_goal")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}
