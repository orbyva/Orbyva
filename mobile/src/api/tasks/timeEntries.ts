import { getCurrentUserId } from "@/lib/auth-user";
import { startOfLocalDay } from "@/lib/dates";
import { supabase } from "@/lib/supabase";
import type { TaskTimeEntry } from "@/types/tasks";

export async function fetchRunningEntry(): Promise<TaskTimeEntry | null> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("task_time_entry")
    .select("id, task_id, started_at, ended_at")
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
    .select("id, task_id, started_at, ended_at")
    .eq("user_id", userId)
    .gte("started_at", startOfLocalDay().toISOString())
    .order("started_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchAllEntries(): Promise<TaskTimeEntry[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("task_time_entry")
    .select("id, task_id, started_at, ended_at")
    .eq("user_id", userId)
    .order("started_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchLastInteractedEntry(): Promise<TaskTimeEntry | null> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("task_time_entry")
    .select("id, task_id, started_at, ended_at")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function startTimer(taskId: string): Promise<TaskTimeEntry> {
  const userId = await getCurrentUserId();
  const running = await fetchRunningEntry();
  if (running) await stopTimer(running.id);

  const { data, error } = await supabase
    .from("task_time_entry")
    .insert([
      { user_id: userId, task_id: taskId, started_at: new Date().toISOString() },
    ])
    .select("id, task_id, started_at, ended_at")
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

export async function fetchEntriesForTask(taskId: string): Promise<TaskTimeEntry[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("task_time_entry")
    .select("id, task_id, started_at, ended_at")
    .eq("user_id", userId)
    .eq("task_id", taskId)
    .order("started_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function updateTimeEntry(
  entryId: string,
  updates: { started_at?: string; ended_at?: string | null }
): Promise<TaskTimeEntry> {
  if (updates.started_at && updates.ended_at && updates.ended_at <= updates.started_at) {
    throw new Error("O fim precisa ser depois do início.");
  }
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("task_time_entry")
    .update(updates)
    .eq("id", entryId)
    .eq("user_id", userId)
    .select("id, task_id, started_at, ended_at")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteTimeEntry(entryId: string): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("task_time_entry")
    .delete()
    .eq("id", entryId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}
