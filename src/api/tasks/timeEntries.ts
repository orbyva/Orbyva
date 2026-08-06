import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth-user";
import { startOfLocalDay } from "@/lib/dates";
import type { TaskTimeEntry } from "@/types/tasks";

export async function fetchRunningEntry(): Promise<TaskTimeEntry | null> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("task_time_entry")
    .select("*")
    .eq("user_id", userId)
    .is("ended_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function fetchTodayEntries(): Promise<TaskTimeEntry[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("task_time_entry")
    .select("*")
    .eq("user_id", userId)
    .gte("started_at", startOfLocalDay().toISOString())
    .order("started_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Para o timer atual (se houver) antes de iniciar um novo — só um "Live" por vez. */
export async function startTimer(taskId: string): Promise<TaskTimeEntry> {
  const userId = await getCurrentUserId();
  const running = await fetchRunningEntry();
  if (running) await stopTimer(running.id);

  const { data, error } = await supabase
    .from("task_time_entry")
    .insert([
      { user_id: userId, task_id: taskId, started_at: new Date().toISOString() },
    ])
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function stopTimer(entryId: string): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("task_time_entry")
    .update({ ended_at: new Date().toISOString() })
    .eq("id", entryId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}
