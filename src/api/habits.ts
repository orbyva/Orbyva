import { supabase } from "@/lib/supabase";
import type {
  Habit,
  HabitCreateRequest,
  HabitLog,
  HabitUpdateRequest,
} from "@/types/habits";

async function getCurrentUserId(): Promise<string> {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Usuário não autenticado.");
  return user.id;
}

export async function fetchHabits(): Promise<Habit[]> {
  const { data, error } = await supabase
    .from("habit")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchHabitLogs(habitId: string): Promise<HabitLog[]> {
  const { data, error } = await supabase
    .from("habit_log")
    .select("*")
    .eq("habit_id", habitId)
    .order("date", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchAllHabitLogs(): Promise<HabitLog[]> {
  const habits = await fetchHabits();
  if (habits.length === 0) return [];
  const ids = habits.map((h) => h.id);
  const { data, error } = await supabase
    .from("habit_log")
    .select("*")
    .in("habit_id", ids)
    .order("date", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createHabit(habit: HabitCreateRequest): Promise<Habit> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("habit")
    .insert([{ ...habit, user_id: userId }])
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateHabit(data: HabitUpdateRequest): Promise<void> {
  const { id, ...fields } = data;
  const { error } = await supabase.from("habit").update(fields).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteHabit(id: string): Promise<void> {
  const { error } = await supabase.from("habit").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function toggleHabitLog(
  habitId: string,
  date: string,
  completed: boolean
): Promise<void> {
  const { data: existing } = await supabase
    .from("habit_log")
    .select("id")
    .eq("habit_id", habitId)
    .eq("date", date)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("habit_log")
      .update({ completed })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase
    .from("habit_log")
    .insert([{ habit_id: habitId, date, completed }]);
  if (error) throw new Error(error.message);
}
