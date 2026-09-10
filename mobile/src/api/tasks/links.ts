import { getCurrentUserId } from "@/lib/auth-user";
import { supabase } from "@/lib/supabase";
import type { TaskExternalLinkDraft } from "@/types/tasks";

export async function fetchExternalLinksForTask(
  taskId: string
): Promise<{ id: string; url: string; comment: string | null }[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("task_external_link")
    .select("id, url, comment")
    .eq("user_id", userId)
    .eq("task_id", taskId)
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function saveExternalLinksForTask(
  taskId: string,
  drafts: TaskExternalLinkDraft[]
): Promise<void> {
  const userId = await getCurrentUserId();
  const { error: delError } = await supabase
    .from("task_external_link")
    .delete()
    .eq("user_id", userId)
    .eq("task_id", taskId);
  if (delError) throw new Error(delError.message);
  const rows = drafts
    .map((draft) => draft.url.trim())
    .filter(Boolean)
    .map((url, position) => ({
      user_id: userId,
      task_id: taskId,
      url,
      comment: null,
      position,
    }));
  if (rows.length === 0) return;
  const { error } = await supabase.from("task_external_link").insert(rows);
  if (error) throw new Error(error.message);
}
