import { getCurrentUserId } from "@/lib/auth-user";
import { supabase } from "@/lib/supabase";
import { getTodayIso } from "@/domain/timeline";

export type HubHabit = { id: string; name: string };
export type HubHabitLog = {
  id: string;
  habit_id: string;
  date: string;
  completed: boolean;
};
export type HubMovie = { title: string; poster: string | null; rating: number | null };
export type HubTrip = { title: string; start_date: string };

export function isCompletedToday(
  logs: HubHabitLog[],
  today = getTodayIso()
): boolean {
  return logs.some((l) => l.date === today && l.completed);
}

export async function fetchHubHabits(todayIso: string): Promise<{
  habits: HubHabit[];
  logs: HubHabitLog[];
}> {
  const userId = await getCurrentUserId();
  const { data: habits, error: habitError } = await supabase
    .from("habit")
    .select("id, name")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (habitError) throw new Error(habitError.message);
  const list = (habits ?? []) as HubHabit[];
  if (list.length === 0) return { habits: [], logs: [] };

  const { data: logs, error: logError } = await supabase
    .from("habit_log")
    .select("id, habit_id, date, completed")
    .in(
      "habit_id",
      list.map((h) => h.id)
    )
    .gte("date", todayIso);
  if (logError) throw new Error(logError.message);
  return { habits: list, logs: (logs ?? []) as HubHabitLog[] };
}

export async function fetchLastWatchedMovie(): Promise<HubMovie | null> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("movie")
    .select("title, poster, rating")
    .eq("user_id", userId)
    .eq("status", "watched")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    title: String(data.title ?? ""),
    poster: (data.poster as string | null) ?? null,
    rating: data.rating == null ? null : Number(data.rating),
  };
}

export async function fetchNextTrip(todayIso: string): Promise<HubTrip | null> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("trip")
    .select("title, start_date, status")
    .eq("user_id", userId)
    .gte("start_date", todayIso)
    .not("status", "in", "(cancelled,completed)")
    .order("start_date", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    title: String(data.title ?? "Viagem"),
    start_date: String(data.start_date ?? todayIso),
  };
}
