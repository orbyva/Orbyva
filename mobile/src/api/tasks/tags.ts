import { countTagUsage } from "@/domain/tasks/tags";
import { getCurrentUserId } from "@/lib/auth-user";
import { supabase } from "@/lib/supabase";
import type { Tag } from "@/types/tasks";

export async function fetchTags(): Promise<Tag[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("tag")
    .select("id, name, color")
    .eq("user_id", userId)
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Tag[];
}

/** Uso de cada tag somando tarefas e projetos. */
export async function fetchTagUsage(): Promise<Map<string, number>> {
  const userId = await getCurrentUserId();
  const [tasks, projects] = await Promise.all([
    supabase.from("task").select("tag_ids").eq("user_id", userId),
    supabase.from("project").select("tag_ids").eq("user_id", userId),
  ]);
  if (tasks.error) throw new Error(tasks.error.message);
  if (projects.error) throw new Error(projects.error.message);
  return countTagUsage([
    ...((tasks.data ?? []) as { tag_ids?: string[] | null }[]),
    ...((projects.data ?? []) as { tag_ids?: string[] | null }[]),
  ]);
}

export async function createTagApi(
  name: string,
  color = "#A855F7"
): Promise<Tag> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("tag")
    .insert([{ user_id: userId, name, color }])
    .select("id, name, color")
    .single();
  if (error) throw new Error(error.message);
  return data as Tag;
}

export async function updateTagApi(input: {
  id: string;
  name: string;
  color: string;
}): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("tag")
    .update({ name: input.name, color: input.color })
    .eq("id", input.id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function deleteTagApi(id: string): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("tag")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}
