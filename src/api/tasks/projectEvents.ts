import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth-user";
import type {
  ProjectEvent,
  ProjectEventCreateRequest,
  ProjectEventUpdateRequest,
} from "@/types/tasks";

export async function fetchProjectEvents(): Promise<ProjectEvent[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("project_event")
    .select("*")
    .eq("user_id", userId)
    .order("starts_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createProjectEvent(
  event: ProjectEventCreateRequest
): Promise<ProjectEvent> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("project_event")
    .insert([{ ...event, user_id: userId }])
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Feature 103 — a irmã que faltava. O filtro é duplo (`id` **e** `user_id`), como em
 * `deleteProjectEvent`: a RLS já barra a linha alheia, mas repetir o dono aqui é o que garante que
 * um `id` vazado nunca vire um `update` de escopo aberto se a política mudar.
 */
export async function updateProjectEvent(
  data: ProjectEventUpdateRequest
): Promise<ProjectEvent> {
  const userId = await getCurrentUserId();
  const { id, ...fields } = data;
  const { data: updated, error } = await supabase
    .from("project_event")
    .update(fields)
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return updated;
}

export async function deleteProjectEvent(id: string): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("project_event")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}
