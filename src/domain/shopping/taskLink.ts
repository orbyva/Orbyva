import type { ShoppingCategory, ShoppingItem, ShoppingItemStatus } from "@/types/shopping";
import type { TaskStatus } from "@/types/tasks";

/** Preset de ícone gravado nas tarefas criadas a partir de um item da lista — precisa existir em
 * `TASK_ICON_PRESETS` (`src/pages/admin/tasks/TaskIconBadge.tsx`) pra aparecer na UI. Mora aqui,
 * no domínio, pra não fazer a camada pura depender de um componente. */
export const SHOPPING_TASK_ICON_KEY = "shopping-cart";

/** O que a tarefa criada a partir de um item precisa carregar — só os campos que o vínculo
 * define. Quem insere completa o resto (`user_id`, defaults da tabela). */
export interface ShoppingTaskDraft {
  title: string;
  description: string | null;
  icon_key: string;
  linked_shopping_item_id: string;
  status: TaskStatus;
}

/** Quantidade + unidade em texto ("2 pacotes", "3 m"), vazio quando o item não tem nenhum dos dois. */
function formatQuantity(item: ShoppingItem): string {
  return [item.quantity ?? null, item.unit?.trim() || null]
    .filter((part) => part !== null && part !== "")
    .join(" ");
}

/**
 * Monta o rascunho da tarefa "me comprometo a comprar isto" a partir de um item da lista.
 * O título vira "Comprar <item>" (o compromisso, não só o nome da coisa) e a descrição reúne o
 * contexto que o usuário já tinha preenchido: categoria, quantidade/unidade, descrição e link do
 * fornecedor. `icon_key` é sempre o preset de compras — é o "ícone vinculado" do pedido — e a
 * tarefa nasce em `todo`, sem recorrência (`recurrence_rule` fica nulo, então
 * `materializeRecurringInstances` nunca gera instâncias dela).
 */
export function buildTaskDraftFromItem(
  item: ShoppingItem,
  category?: ShoppingCategory | null
): ShoppingTaskDraft {
  const quantity = formatQuantity(item);
  const description =
    [
      category?.name ? `Lista de Compras · ${category.name}` : "Lista de Compras",
      quantity || null,
      item.description?.trim() || null,
      item.provider_link?.trim() || null,
    ]
      .filter(Boolean)
      .join("\n") || null;

  return {
    title: `Comprar ${item.title}`,
    description,
    icon_key: SHOPPING_TASK_ICON_KEY,
    linked_shopping_item_id: item.id,
    status: resolveTaskStatusFromItem(item.status),
  };
}

/** Tarefa concluída ⇒ item comprado; tarefa reaberta (todo/doing) ⇒ item pendente. */
export function resolveItemStatusFromTask(taskStatus: TaskStatus): ShoppingItemStatus {
  return taskStatus === "done" ? "purchased" : "pending";
}

/** Item comprado ⇒ tarefa concluída; item pendente ⇒ tarefa em `todo`. */
export function resolveTaskStatusFromItem(itemStatus: ShoppingItemStatus): TaskStatus {
  return itemStatus === "purchased" ? "done" : "todo";
}
