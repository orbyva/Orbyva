import { supabase } from "@/lib/supabase";
import type {
  PersonalGoal,
  PersonalGoalCreateRequest,
  PersonalGoalUpdateRequest,
} from "@/types/goals";

async function getCurrentUserId(): Promise<string> {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Usuário não autenticado.");
  return user.id;
}

export async function fetchGoals(): Promise<PersonalGoal[]> {
  const { data, error } = await supabase
    .from("personal_goal")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createGoal(goal: PersonalGoalCreateRequest): Promise<PersonalGoal> {
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
  const { id, ...fields } = data;
  const { error } = await supabase
    .from("personal_goal")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteGoal(id: string): Promise<void> {
  const { error } = await supabase.from("personal_goal").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
