import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth-user";
import type {
  Habit,
  HabitCreateRequest,
  HabitLog,
  HabitUpdateRequest,
} from "@/types/habits";

async function assertHabitOwned(habitId: string): Promise<Habit> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("habit")
    .select("*")
    .eq("id", habitId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Hábito não encontrado.");
  return data as Habit;
}

export async function fetchHabits(): Promise<Habit[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("habit")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Habit[];
}

export async function fetchHabitLogs(habitId: string): Promise<HabitLog[]> {
  await assertHabitOwned(habitId);
  const { data, error } = await supabase
    .from("habit_log")
    .select("id, habit_id, date, completed")
    .eq("habit_id", habitId)
    .order("date", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export type FetchHabitLogsOptions = {
  /** Se omitido, busca hábitos do usuário primeiro. */
  habitIds?: string[];
  /** ISO `YYYY-MM-DD` inclusive — evita baixar histórico inteiro. */
  fromDate?: string;
};

/** Logs de vários hábitos sem refetchar a lista de hábitos se `habitIds` for passado. */
export async function fetchAllHabitLogs(
  options: FetchHabitLogsOptions = {}
): Promise<HabitLog[]> {
  let ids = options.habitIds;
  if (!ids) {
    const habits = await fetchHabits();
    ids = habits.map((h) => h.id);
  }
  if (ids.length === 0) return [];

  let query = supabase
    .from("habit_log")
    .select("id, habit_id, date, completed")
    .in("habit_id", ids)
    .order("date", { ascending: false });

  if (options.fromDate) {
    query = query.gte("date", options.fromDate);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Um round-trip de hábitos + logs (opcionalmente desde `fromDate`). */
export async function fetchHabitsWithLogs(
  options: { fromDate?: string } = {}
): Promise<{ habits: Habit[]; logs: HabitLog[] }> {
  const habits = await fetchHabits();
  const logs = await fetchAllHabitLogs({
    habitIds: habits.map((h) => h.id),
    fromDate: options.fromDate,
  });
  return { habits, logs };
}

export async function createHabit(habit: HabitCreateRequest): Promise<Habit> {
  const userId = await getCurrentUserId();
  const payload = {
    ...habit,
    kind: habit.kind ?? "build",
    goal_id: habit.goal_id || null,
    goal_increment:
      habit.goal_id && habit.goal_increment != null && habit.goal_increment > 0
        ? habit.goal_increment
        : null,
    user_id: userId,
  };
  const { data, error } = await supabase
    .from("habit")
    .insert([payload])
    .select()
    .single();
  if (error) {
    if (/goal_id|kind|goal_increment/i.test(error.message)) {
      // Migração ainda não aplicada — salva o mínimo.
      const { data: fallback, error: fallbackError } = await supabase
        .from("habit")
        .insert([
          {
            name: habit.name,
            description: habit.description,
            frequency: habit.frequency,
            target_per_week: habit.target_per_week,
            color: habit.color,
            user_id: userId,
          },
        ])
        .select()
        .single();
      if (fallbackError) throw new Error(fallbackError.message);
      return fallback as Habit;
    }
    throw new Error(error.message);
  }
  return data as Habit;
}

export async function updateHabit(data: HabitUpdateRequest): Promise<void> {
  const userId = await getCurrentUserId();
  const { id, ...fields } = data;
  const payload = {
    ...fields,
    goal_id: fields.goal_id === undefined ? undefined : fields.goal_id || null,
    goal_increment:
      fields.goal_id === "" || fields.goal_id == null
        ? null
        : fields.goal_increment,
  };
  const { error } = await supabase
    .from("habit")
    .update(payload)
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

async function syncLinkedGoal(
  habit: Habit,
  completedDelta: 1 | -1
): Promise<void> {
  if (!habit.goal_id) return;
  const increment = Number(habit.goal_increment);
  if (!Number.isFinite(increment) || increment <= 0) return;

  const userId = await getCurrentUserId();
  const { data: goal, error } = await supabase
    .from("personal_goal")
    .select("id, current_value, target_value, status")
    .eq("id", habit.goal_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!goal || goal.status !== "active") return;

  const next = Math.round(
    (Number(goal.current_value) + completedDelta * increment) * 100
  ) / 100;
  const clamped = Math.min(
    Number(goal.target_value),
    Math.max(0, next)
  );

  const { error: updateError } = await supabase
    .from("personal_goal")
    .update({
      current_value: clamped,
      updated_at: new Date().toISOString(),
    })
    .eq("id", goal.id)
    .eq("user_id", userId);
  if (updateError) throw new Error(updateError.message);
}

export async function toggleHabitLog(
  habitId: string,
  date: string,
  completed: boolean
): Promise<void> {
  const habit = await assertHabitOwned(habitId);

  const { data: existing } = await supabase
    .from("habit_log")
    .select("id, completed")
    .eq("habit_id", habitId)
    .eq("date", date)
    .maybeSingle();

  const wasCompleted = Boolean(existing?.completed);

  if (existing) {
    const { error } = await supabase
      .from("habit_log")
      .update({ completed })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("habit_log")
      .insert([{ habit_id: habitId, date, completed }]);
    if (error) throw new Error(error.message);
  }

  if (wasCompleted === completed) return;
  try {
    await syncLinkedGoal(habit, completed ? 1 : -1);
  } catch {
    /* vínculo com meta é best-effort */
  }
}
