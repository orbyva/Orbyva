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

/**
 * Quantas categorias de compras este projeto tem — o número que a aba "Compras" da página do
 * projeto mostra (feature 069). `head: true` + `count: "exact"`: o PostgREST devolve só a
 * contagem no cabeçalho, sem trazer linha nenhuma. A unidade contada é a categoria porque é o que
 * a aba lista (cada categoria com seus itens), o mesmo que o estado vazio da seção diz.
 */
export async function countShoppingCategoriesByProject(
  projectId: string
): Promise<number> {
  const userId = await getCurrentUserId();
  const { count, error } = await supabase
    .from("shopping_category")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("project_id", projectId);
  if (error) throw new Error(error.message);
  return count ?? 0;
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
