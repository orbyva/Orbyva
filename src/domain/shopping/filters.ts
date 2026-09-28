import type { ShoppingCategory, ShoppingItem } from "@/types/shopping";

/**
 * Chave do pseudo-grupo dos itens sem categoria. Não é o id de nenhuma linha do banco — a
 * ausência de categoria é `null` lá; esta constante só serve para indexar contagens e dar `key`
 * ao grupo na UI. **Não** existe em `shopping_category`.
 */
export const UNCATEGORIZED_GROUP_ID = "__uncategorized__";

/** Rótulo / nome exibido do pseudo-grupo dos itens sem categoria. */
export const UNCATEGORIZED_GROUP_LABEL = "Sem categoria";

/** Alias do rótulo — mesmo valor, nome usado em alguns testes/comentários da agenda. */
export const UNCATEGORIZED_GROUP_NAME = UNCATEGORIZED_GROUP_LABEL;

export interface ShoppingCategoryGroup {
  /**
   * `null` = pseudo-grupo dos itens sem categoria: não tem cor, nem edição, nem exclusão.
   * Preferimos `null` a um objeto sintético para o vínculo com projeto continuar sendo só da
   * categoria real (feature 052 / ProjectShoppingSection).
   */
  category: ShoppingCategory | null;
  items: ShoppingItem[];
  /**
   * `true` só no grupo "Sem categoria": não há linha em `shopping_category` por trás dele, então a
   * UI não oferece editar/excluir categoria (o "Adicionar item" da seção ainda pode nascer sem
   * categoria).
   */
  synthetic?: boolean;
}

export interface GroupItemsByCategoryOptions {
  /**
   * Inclui o grupo "Sem categoria" (padrão: sim, quando há algum item nulo). Vai a falso com
   * filtro de projeto ativo: o vínculo com projeto é da **categoria**, então item sem categoria
   * não pertence a projeto nenhum e não pode aparecer numa lista recortada por projeto.
   */
  includeUncategorized?: boolean;
}

/**
 * Agrupa os itens pelas categorias recebidas, preservando a ordem das categorias.
 * Categoria sem item aparece com `items` vazio (estado vazio próprio na UI) e item cuja
 * categoria não está na lista é ignorado. Dentro de cada grupo, `pending` vem antes de
 * `purchased`; itens de mesmo status mantêm a ordem em que chegaram.
 *
 * Itens de `shopping_category_id` nulo caem num grupo próprio com `category: null` e
 * `synthetic: true`, sempre **por último** e só quando existe pelo menos um deles. Isso é
 * diferente de "categoria inexistente": item apontando para um id que não veio na lista
 * continua sendo ignorado, não jogado no grupo sem categoria.
 */
export function groupItemsByCategory(
  items: ShoppingItem[],
  categories: ShoppingCategory[],
  options: GroupItemsByCategoryOptions = {}
): ShoppingCategoryGroup[] {
  const { includeUncategorized = true } = options;
  const groups = new Map<string, ShoppingItem[]>();
  for (const category of categories) groups.set(category.id, []);

  const uncategorized: ShoppingItem[] = [];
  for (const item of items) {
    if (item.shopping_category_id == null) {
      uncategorized.push(item);
      continue;
    }
    groups.get(item.shopping_category_id)?.push(item);
  }

  const result: ShoppingCategoryGroup[] = categories.map((category) => ({
    category,
    items: sortPendingFirst(groups.get(category.id) ?? []),
  }));

  if (includeUncategorized && uncategorized.length > 0) {
    result.push({
      category: null,
      items: sortPendingFirst(uncategorized),
      synthetic: true,
    });
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
 *
 * Trabalha só com categorias: o grupo "Sem categoria" é assunto de `groupItemsByCategory`, e esta
 * função nunca o introduz.
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
 * contados sob `UNCATEGORIZED_GROUP_ID`, a mesma chave do grupo sintético — assim o cabeçalho de
 * "Sem categoria" lê a contagem do mesmo jeito que o das categorias reais.
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
