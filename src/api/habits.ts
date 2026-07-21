import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth-user";
import type {
  Habit,
  HabitCreateRequest,
  HabitLog,
  HabitUpdateRequest,
} from "@/types/habits";

async function assertHabitOwned(habitId: string): Promise<void> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("habit")
    .select("id")
    .eq("id", habitId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Hábito não encontrado.");
}

export async function fetchHabits(): Promise<Habit[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("habit")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchHabitLogs(habitId: string): Promise<HabitLog[]> {
  await assertHabitOwned(habitId);
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
  const userId = await getCurrentUserId();
  const { id, ...fields } = data;
  const { error } = await supabase
    .from("habit")
    .update(fields)
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function deleteHabit(id: string): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("habit")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function toggleHabitLog(
  habitId: string,
  date: string,
  completed: boolean
): Promise<void> {
  await assertHabitOwned(habitId);

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
