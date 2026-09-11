import { getCurrentUserId } from "@/lib/auth-user";
import { supabase } from "@/lib/supabase";
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
  return (data ?? []) as ContentLink[];
}

export async function fetchContentLinkById(id: string): Promise<ContentLink | null> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("content_link")
    .select("*")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ContentLink | null) ?? null;
}

export async function createContentLink(
  link: ContentLinkCreateRequest
): Promise<ContentLink> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("content_link")
    .insert([
      {
        ...link,
        user_id: userId,
        consumed_at: link.status === "consumed" ? new Date().toISOString() : null,
      },
    ])
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as ContentLink;
}

export async function updateContentLink(
  data: ContentLinkUpdateRequest
): Promise<void> {
  const userId = await getCurrentUserId();
  const { id, ...fields } = data;
  const payload: Record<string, unknown> = { ...fields };
  if (fields.status === "consumed") {
    payload.consumed_at = new Date().toISOString();
  } else if (fields.status === "to_consume") {
    payload.consumed_at = null;
  }
  const { error } = await supabase
    .from("content_link")
    .update(payload)
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

export async function markContentLinkConsumed(
  id: string,
  consumed: boolean
): Promise<void> {
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
