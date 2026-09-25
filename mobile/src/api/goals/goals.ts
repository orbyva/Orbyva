import { getCurrentUserId } from "@/lib/auth-user";
import { supabase } from "@/lib/supabase";
import { sumAporteProgress } from "@/domain/goals/finance";
import type { PersonalGoal, PersonalGoalCreateRequest } from "@/types/goals";

function asOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function fetchGoals(): Promise<PersonalGoal[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("personal_goal")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as PersonalGoal[];
}

export async function fetchGoalById(id: string): Promise<PersonalGoal | null> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("personal_goal")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as PersonalGoal | null) ?? null;
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
  return data as PersonalGoal;
}

export async function updateGoal(input: {
  id: string;
  title: string;
  description?: string | null;
  category: PersonalGoal["category"];
  target_value: number;
  current_value: number;
  unit?: string | null;
  deadline?: string | null;
  status: PersonalGoal["status"];
}): Promise<void> {
  const userId = await getCurrentUserId();
  const { id, ...fields } = input;
  const { error } = await supabase
    .from("personal_goal")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function updateGoalProgress(
  id: string,
  currentValue: number
): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("personal_goal")
    .update({
      current_value: currentValue,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function sumGoalAporteFromLedger(goalTitle: string): Promise<number> {
  const title = goalTitle.trim();
  if (!title) return 0;

  const { data, error } = await supabase.rpc("get_goal_aporte_sum", {
    p_title: title,
  });
  if (!error) return Math.abs(Number(data) || 0);

  const userId = await getCurrentUserId();
  const { data: rows, error: fallbackError } = await supabase
    .from("transaction")
    .select("value, description, class:class_id(name)")
    .eq("user_id", userId);
  if (fallbackError) throw new Error(fallbackError.message);
  return sumAporteProgress(
    (rows ?? []).map((row) => ({
      value: row.value as number,
      description: row.description as string | null,
      class: asOne(row.class as { name?: string } | { name?: string }[] | null),
    })),
    title
  );
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
