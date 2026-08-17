import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth-user";
import {
  buildTaskDraftFromItem,
  resolveTaskStatusFromItem,
} from "@/domain/shopping/taskLink";
import type {
  ShoppingCategory,
  ShoppingItem,
  ShoppingItemCreateRequest,
  ShoppingItemStatus,
  ShoppingItemUpdateRequest,
} from "@/types/shopping";
import type { Task, TaskStatus } from "@/types/tasks";

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

/**
 * Alterna comprado/não comprado — usado pelo checkbox da linha do item — e propaga o novo
 * estado para a tarefa vinculada, se houver. A sincronização é best-effort: acontece dentro de
 * um `try/catch` que apenas loga, para nunca derrubar a marcação do item (mesmo formato do
 * vínculo com Recorrência Financeira, feature 002).
 */
export async function setShoppingItemStatus(
  id: string,
  status: ShoppingItemStatus
): Promise<void> {
  await updateShoppingItem({ id, status });
  try {
    await syncLinkedTaskFromItem(id, status);
  } catch (syncError) {
    console.error("Falha ao sincronizar tarefa vinculada ao item:", syncError);
  }
}

/**
 * Grava o status derivado direto na tabela `task` — de propósito não chama `updateTask`, que
 * dispararia a sincronização no sentido oposto e criaria ping-pong entre os dois lados.
 */
async function syncLinkedTaskFromItem(
  itemId: string,
  status: ShoppingItemStatus
): Promise<void> {
  const userId = await getCurrentUserId();
  const taskStatus: TaskStatus = resolveTaskStatusFromItem(status);
  const { error } = await supabase
    .from("task")
    .update({
      status: taskStatus,
      completed_at: taskStatus === "done" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("linked_shopping_item_id", itemId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/** O que a lista precisa saber sobre a tarefa de um item: existe, como se chama, em que pé está. */
export interface ShoppingItemTaskLink {
  taskId: string;
  title: string;
  status: TaskStatus;
}

/**
 * Cria a tarefa "me comprometo a comprar isto" a partir de um item da lista (relação 1:1: quem
 * chama só oferece o botão quando o item ainda não tem tarefa). A tarefa nasce com o ícone de
 * compras (`icon_key`), o vínculo unidirecional `linked_shopping_item_id` e sem recorrência.
 */
export async function createTaskFromShoppingItem(
  itemId: string
): Promise<Task> {
  const userId = await getCurrentUserId();

  const { data: item, error: itemError } = await supabase
    .from("shopping_item")
    .select("*")
    .eq("id", itemId)
    .eq("user_id", userId)
    .maybeSingle();
  if (itemError) throw new Error(itemError.message);
  if (!item) throw new Error("Item não encontrado.");

  let category: ShoppingCategory | null = null;
  if (item.shopping_category_id) {
    const { data, error } = await supabase
      .from("shopping_category")
      .select("*")
      .eq("id", item.shopping_category_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    category = data ?? null;
  }

  const draft = buildTaskDraftFromItem(item as ShoppingItem, category);
  const { data: task, error } = await supabase
    .from("task")
    .insert([
      {
        ...draft,
        user_id: userId,
        completed_at: draft.status === "done" ? new Date().toISOString() : null,
      },
    ])
    .select()
    .single();
  if (error) throw new Error(error.message);
  return task;
}

/**
 * Uma única consulta para toda a página: quais dos itens carregados já têm tarefa. Evita o N+1
 * de perguntar item a item — `where linked_shopping_item_id in (<ids da página>)` volta num
 * `Map` indexado pelo id do item.
 */
export async function fetchTaskLinksForItems(
  itemIds: string[]
): Promise<Map<string, ShoppingItemTaskLink>> {
  const links = new Map<string, ShoppingItemTaskLink>();
  if (itemIds.length === 0) return links;

  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("task")
    .select("id, title, status, linked_shopping_item_id")
    .eq("user_id", userId)
    .in("linked_shopping_item_id", itemIds);
  if (error) throw new Error(error.message);

  for (const row of data ?? []) {
    if (!row.linked_shopping_item_id) continue;
    links.set(row.linked_shopping_item_id, {
      taskId: row.id,
      title: row.title,
      status: row.status,
    });
  }
  return links;
}
