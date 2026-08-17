import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth-user";
import type {
  ShoppingItem,
  ShoppingItemCreateRequest,
  ShoppingItemStatus,
  ShoppingItemUpdateRequest,
} from "@/types/shopping";

export async function fetchShoppingItems(): Promise<ShoppingItem[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("shopping_item")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createShoppingItem(
  item: ShoppingItemCreateRequest
): Promise<ShoppingItem> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("shopping_item")
    .insert([{ ...item, user_id: userId }])
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateShoppingItem(
  data: ShoppingItemUpdateRequest
): Promise<void> {
  const userId = await getCurrentUserId();
  const { id, ...fields } = data;
  const { error } = await supabase
    .from("shopping_item")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function deleteShoppingItem(id: string): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("shopping_item")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/** Alterna comprado/não comprado — usado pelo checkbox da linha do item. */
export async function setShoppingItemStatus(
  id: string,
  status: ShoppingItemStatus
): Promise<void> {
  await updateShoppingItem({ id, status });
}
