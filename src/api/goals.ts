import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth-user";
import type {
  PersonalGoal,
  PersonalGoalCreateRequest,
  PersonalGoalUpdateRequest,
} from "@/types/goals";

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
