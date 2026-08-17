import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth-user";
import type {
  ShoppingCategory,
  ShoppingCategoryCreateRequest,
  ShoppingCategoryUpdateRequest,
} from "@/types/shopping";

export interface FetchShoppingCategoriesOptions {
  /**
   * Restringe às categorias de um projeto (feature 052). Nulo/omitido = sem filtro, devolve
   * todas — inclusive as sem projeto. Com filtro, o `project_id is null` fica de fora: categoria
   * sem projeto não pertence a projeto nenhum.
   */
  projectId?: string | null;
}

export async function fetchShoppingCategories(
  options: FetchShoppingCategoriesOptions = {}
): Promise<ShoppingCategory[]> {
  const userId = await getCurrentUserId();
  let query = supabase
    .from("shopping_category")
    .select("*")
    .eq("user_id", userId);
  if (options.projectId) query = query.eq("project_id", options.projectId);
  const { data, error } = await query.order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createShoppingCategory(
  category: ShoppingCategoryCreateRequest
): Promise<ShoppingCategory> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("shopping_category")
    .insert([{ ...category, user_id: userId }])
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateShoppingCategory(
  data: ShoppingCategoryUpdateRequest
): Promise<void> {
  const userId = await getCurrentUserId();
  const { id, ...fields } = data;
  const { error } = await supabase
    .from("shopping_category")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/** Apaga a categoria — os itens dela somem junto (`on delete cascade`). */
export async function deleteShoppingCategory(id: string): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("shopping_category")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}
