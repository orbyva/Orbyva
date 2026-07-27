import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth-user";
import {
  goalAporteDescription,
  sumAporteProgress,
} from "@/domain/goals/finance";
import type {
  PersonalGoal,
  PersonalGoalCreateRequest,
  PersonalGoalUpdateRequest,
} from "@/types/goals";

function escapeIlike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/** Soma lançamentos com descrição "Aporte meta: {título}…". */
export async function sumGoalAporteFromLedger(
  goalTitle: string
): Promise<number> {
  const userId = await getCurrentUserId();
  const prefix = escapeIlike(goalAporteDescription(goalTitle));
  const { data, error } = await supabase
    .from("transaction")
    .select("value, description")
    .eq("user_id", userId)
    .ilike("description", `${prefix}%`);
  if (error) throw new Error(error.message);
  return sumAporteProgress(data ?? [], goalTitle);
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
