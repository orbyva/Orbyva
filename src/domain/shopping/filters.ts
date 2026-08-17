import type { ShoppingCategory, ShoppingItem } from "@/types/shopping";

export interface ShoppingCategoryGroup {
  category: ShoppingCategory;
  items: ShoppingItem[];
}

/**
 * Agrupa os itens pelas categorias recebidas, preservando a ordem das categorias.
 * Categoria sem item aparece com `items` vazio (estado vazio próprio na UI) e item cuja
 * categoria não está na lista é ignorado. Dentro de cada grupo, `pending` vem antes de
 * `purchased`; itens de mesmo status mantêm a ordem em que chegaram.
 */
export function groupItemsByCategory(
  items: ShoppingItem[],
  categories: ShoppingCategory[]
): ShoppingCategoryGroup[] {
  const groups = new Map<string, ShoppingItem[]>();
  for (const category of categories) groups.set(category.id, []);

  for (const item of items) {
    groups.get(item.shopping_category_id)?.push(item);
  }

  return categories.map((category) => ({
    category,
    items: sortPendingFirst(groups.get(category.id) ?? []),
  }));
}

/**
 * Recorta as categorias de um projeto, preservando a ordem recebida — o agrupamento por categoria
 * continua sendo o mesmo, filtrar só encurta a lista de categorias (feature 052).
 *
 * `projectId` nulo/indefinido = sem filtro: devolve tudo, inclusive as categorias sem projeto.
 * Com filtro, categoria sem projeto (`project_id` nulo) não aparece em filtro de projeto nenhum —
 * ela é uma categoria comum da casa, não pertence a projeto algum.
 */
export function filterCategoriesByProject(
  categories: ShoppingCategory[],
  projectId: string | null | undefined
): ShoppingCategory[] {
  if (!projectId) return categories;
  return categories.filter((category) => category.project_id === projectId);
}

/** Quantidade de itens ainda não comprados por `shopping_category_id`. */
export function countPendingByCategory(
  items: ShoppingItem[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    if (item.status !== "pending") continue;
    counts[item.shopping_category_id] =
      (counts[item.shopping_category_id] ?? 0) + 1;
  }
  return counts;
}

function sortPendingFirst(items: ShoppingItem[]): ShoppingItem[] {
  const pending = items.filter((item) => item.status === "pending");
  const purchased = items.filter((item) => item.status !== "pending");
  return [...pending, ...purchased];
}
