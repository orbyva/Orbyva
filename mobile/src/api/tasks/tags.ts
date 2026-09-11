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
