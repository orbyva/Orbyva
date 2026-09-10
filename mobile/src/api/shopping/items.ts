import { getCurrentUserId } from "@/lib/auth-user";
import { supabase } from "@/lib/supabase";
import { buildTaskDraftFromItem } from "@/domain/shopping/taskLink";
import type {
  ShoppingCategory,
  ShoppingItem,
  ShoppingItemStatus,
} from "@/types/shopping";
import type { Task } from "@/types/tasks";

const CATEGORY_SELECT = "id, name, color, project_id";
const ITEM_SELECT =
  "id, title, status, shopping_category_id, description, quantity, unit, provider_link";

export async function fetchShoppingCategories(): Promise<ShoppingCategory[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("shopping_category")
    .select(CATEGORY_SELECT)
    .eq("user_id", userId)
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ShoppingCategory[];
}

export async function fetchShoppingItems(): Promise<ShoppingItem[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("shopping_item")
    .select(ITEM_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ShoppingItem[];
}

export async function fetchShoppingItemById(
  id: string
): Promise<ShoppingItem | null> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("shopping_item")
    .select(ITEM_SELECT)
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ShoppingItem | null) ?? null;
}

export async function createShoppingCategoryApi(input: {
  name: string;
  projectId?: string | null;
}): Promise<ShoppingCategory> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("shopping_category")
    .insert([
      {
        user_id: userId,
        name: input.name,
        description: "",
        color: null,
        project_id: input.projectId ?? null,
      },
    ])
    .select(CATEGORY_SELECT)
    .single();
  if (error) throw new Error(error.message);
  return data as ShoppingCategory;
}

export async function updateShoppingCategoryApi(input: {
  id: string;
  name: string;
  projectId: string | null;
}): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("shopping_category")
    .update({
      name: input.name,
      project_id: input.projectId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function deleteShoppingCategoryApi(id: string): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("shopping_category")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function createShoppingItemApi(input: {
  title: string;
  categoryId?: string | null;
  quantity?: number | null;
  unit?: string | null;
  description?: string;
  providerLink?: string | null;
}): Promise<ShoppingItem> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("shopping_item")
    .insert([
      {
        user_id: userId,
        title: input.title,
        shopping_category_id: input.categoryId ?? null,
        status: "pending",
        quantity: input.quantity ?? null,
        unit: input.unit ?? null,
        description: input.description ?? "",
        provider_link: input.providerLink ?? null,
      },
    ])
    .select(ITEM_SELECT)
    .single();
  if (error) throw new Error(error.message);
  return data as ShoppingItem;
}

export async function updateShoppingItemApi(input: {
  id: string;
  title: string;
  categoryId: string | null;
  quantity: number | null;
  unit: string | null;
  description: string;
  providerLink: string | null;
}): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("shopping_item")
    .update({
      title: input.title,
      shopping_category_id: input.categoryId,
      quantity: input.quantity,
      unit: input.unit,
      description: input.description,
      provider_link: input.providerLink,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function deleteShoppingItemApi(id: string): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("shopping_item")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function setShoppingItemStatusApi(
  id: string,
  status: ShoppingItemStatus
): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("shopping_item")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function createTaskFromShoppingItemApi(
  item: ShoppingItem,
  category: ShoppingCategory | null
): Promise<Task> {
  const userId = await getCurrentUserId();
  const draft = buildTaskDraftFromItem(item, category);
  const { data, error } = await supabase
    .from("task")
    .insert([
      {
        user_id: userId,
        project_id: category?.project_id ?? null,
        parent_task_id: null,
        title: draft.title,
        description: draft.description ?? "",
        status: draft.status,
        tag_ids: [],
        due_date: null,
        due_time: null,
        start_date: null,
        priority: null,
        recurrence_rule: null,
        linked_recurring_id: null,
        linked_shopping_item_id: draft.linked_shopping_item_id,
        icon_key: draft.icon_key,
        icon_url: null,
        is_milestone: false,
        is_quick: false,
        is_medication: false,
        is_consultation: false,
        sort_order: 0,
      },
    ])
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data as Task;
}

export async function fetchTaskLinksForItems(
  itemIds: string[]
): Promise<Map<string, string>> {
  const links = new Map<string, string>();
  if (itemIds.length === 0) return links;
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("task")
    .select("id, linked_shopping_item_id")
    .eq("user_id", userId)
    .in("linked_shopping_item_id", itemIds);
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    if (row.linked_shopping_item_id) {
      links.set(row.linked_shopping_item_id, row.id);
    }
  }
  return links;
}
