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

export async function createTagApi(name: string): Promise<Tag> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("tag")
    .insert([{ user_id: userId, name, color: "#A855F7" }])
    .select("id, name, color")
    .single();
  if (error) throw new Error(error.message);
  return data as Tag;
}
