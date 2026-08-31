import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth-user";
import type {
  ContentLink,
  ContentLinkCreateRequest,
  ContentLinkUpdateRequest,
} from "@/types/contentLinks";

export async function fetchContentLinks(): Promise<ContentLink[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("content_link")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createContentLink(link: ContentLinkCreateRequest): Promise<ContentLink> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("content_link")
    .insert([{ ...link, user_id: userId }])
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateContentLink(data: ContentLinkUpdateRequest): Promise<void> {
  const userId = await getCurrentUserId();
  const { id, ...fields } = data;
  const { error } = await supabase
    .from("content_link")
    .update(fields)
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function deleteContentLink(id: string): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("content_link")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/** Marca (ou desmarca) um link como consumido — grava/limpa `consumed_at` junto com `status`. */
export async function markContentLinkConsumed(id: string, consumed: boolean): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("content_link")
    .update({
      status: consumed ? "consumed" : "to_consume",
      consumed_at: consumed ? new Date().toISOString() : null,
    })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}
