import { getCurrentUserId } from "@/lib/auth-user";
import { supabase } from "@/lib/supabase";
import type { ProjectEvent } from "@/types/tasks";

export async function fetchProjectEvents(
  projectId?: string
): Promise<ProjectEvent[]> {
  const userId = await getCurrentUserId();
  let query = supabase
    .from("project_event")
    .select("id, project_id, title, starts_at, ends_at")
    .eq("user_id", userId)
    .order("starts_at", { ascending: true });
  if (projectId) query = query.eq("project_id", projectId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as ProjectEvent[];
}

export async function createProjectEventApi(input: {
  projectId: string;
  title: string;
  startsAt: string;
}): Promise<ProjectEvent> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("project_event")
    .insert([
      {
        user_id: userId,
        project_id: input.projectId,
        title: input.title,
        starts_at: input.startsAt,
      },
    ])
    .select("id, project_id, title, starts_at, ends_at")
    .single();
  if (error) throw new Error(error.message);
  return data as ProjectEvent;
}

export async function deleteProjectEventApi(id: string): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("project_event")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}
