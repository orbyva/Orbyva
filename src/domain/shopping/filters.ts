import type { ShoppingCategory, ShoppingItem } from "@/types/shopping";

/**
 * Chave do pseudo-grupo dos itens sem categoria (feature 066). Não é o id de nenhuma linha do
 * banco — a ausência de categoria é `null` lá; esta constante só serve para indexar contagens e
 * dar `key` ao grupo na UI.
 */
export const UNCATEGORIZED_GROUP_ID = "__uncategorized__";

/** Rótulo do pseudo-grupo dos itens sem categoria. */
export const UNCATEGORIZED_GROUP_LABEL = "Sem categoria";

export interface ShoppingCategoryGroup {
  /** `null` = pseudo-grupo dos itens sem categoria: não tem cor, nem edição, nem exclusão. */
  category: ShoppingCategory | null;
  items: ShoppingItem[];
}

/**
 * Agrupa os itens pelas categorias recebidas, preservando a ordem das categorias.
 * Categoria sem item aparece com `items` vazio (estado vazio próprio na UI) e item cuja
 * categoria não está na lista é ignorado. Dentro de cada grupo, `pending` vem antes de
 * `purchased`; itens de mesmo status mantêm a ordem em que chegaram.
 *
 * Itens sem categoria (`shopping_category_id` nulo) caem num grupo próprio com `category: null`,
 * sempre **por último** (feature 066). Ao contrário das categorias reais, esse grupo só existe
 * quando tem item: a categoria vazia é uma intenção do usuário, o grupo sem categoria é só um resto.
 */
export function groupItemsByCategory(
  items: ShoppingItem[],
  categories: ShoppingCategory[]
): ShoppingCategoryGroup[] {
  const groups = new Map<string, ShoppingItem[]>();
  for (const category of categories) groups.set(category.id, []);
  const uncategorized: ShoppingItem[] = [];

  for (const item of items) {
    if (item.shopping_category_id == null) uncategorized.push(item);
    else groups.get(item.shopping_category_id)?.push(item);
  }

  const result: ShoppingCategoryGroup[] = categories.map((category) => ({
    category,
    items: sortPendingFirst(groups.get(category.id) ?? []),
  }));

  if (uncategorized.length > 0) {
    result.push({ category: null, items: sortPendingFirst(uncategorized) });
  }

  return result;
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

/**
 * Quantidade de itens ainda não comprados por `shopping_category_id`. Os itens sem categoria são
 * contados sob `UNCATEGORIZED_GROUP_ID` (feature 066).
 */
export function countPendingByCategory(
  items: ShoppingItem[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    if (item.status !== "pending") continue;
    const key = item.shopping_category_id ?? UNCATEGORIZED_GROUP_ID;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function sortPendingFirst(items: ShoppingItem[]): ShoppingItem[] {
  const pending = items.filter((item) => item.status === "pending");
  const purchased = items.filter((item) => item.status !== "pending");
  return [...pending, ...purchased];
}
