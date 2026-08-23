import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth-user";
import type { Tag, TagCreateRequest, TagUpdateRequest } from "@/types/tasks";

export async function fetchTags(): Promise<Tag[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("tag")
    .select("*")
    .eq("user_id", userId)
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createTag(tag: TagCreateRequest): Promise<Tag> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("tag")
    .insert([{ ...tag, user_id: userId }])
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateTag(data: TagUpdateRequest): Promise<void> {
  const userId = await getCurrentUserId();
  const { id, ...fields } = data;
  const { error } = await supabase
    .from("tag")
    .update(fields)
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/** Exclui a tag e remove o vínculo de toda tarefa/projeto que a referencia (não exclui as linhas). */
export async function deleteTag(id: string): Promise<void> {
  const userId = await getCurrentUserId();

  const [{ data: tasksWithTag, error: tasksError }, { data: projectsWithTag, error: projectsError }] =
    await Promise.all([
      supabase.from("task").select("id, tag_ids").eq("user_id", userId).contains("tag_ids", [id]),
      supabase.from("project").select("id, tag_ids").eq("user_id", userId).contains("tag_ids", [id]),
    ]);
  if (tasksError) throw new Error(tasksError.message);
  if (projectsError) throw new Error(projectsError.message);

  await Promise.all([
    ...(tasksWithTag ?? []).map((t) =>
      supabase
        .from("task")
        .update({
          tag_ids: (t.tag_ids as string[]).filter((tagId) => tagId !== id),
          // Carimba como qualquer outra escrita em `task` (feature 079): não há trigger
          // `moddatetime` no banco, então uma escrita sem `updated_at` deixaria a tarefa com um
          // carimbo velho e ela afundaria na lista ordenada por "Última atualização".
          updated_at: new Date().toISOString(),
        })
        .eq("id", t.id)
    ),
    ...(projectsWithTag ?? []).map((p) =>
      supabase
        .from("project")
        .update({ tag_ids: (p.tag_ids as string[]).filter((tagId) => tagId !== id) })
        .eq("id", p.id)
    ),
  ]);

  const { error } = await supabase.from("tag").delete().eq("id", id).eq("user_id", userId);
  if (error) throw new Error(error.message);
}
