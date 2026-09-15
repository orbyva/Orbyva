import type { ShoppingCategory, ShoppingItem } from "@/types/shopping";

export const SHOPPING_PROJECT_ALL = "all";
export const SHOPPING_PROJECT_NONE = "none";

export function formatShoppingQty(item: ShoppingItem): string {
  return [item.quantity ?? null, item.unit?.trim() || null]
    .filter((part) => part !== null && part !== "")
    .join(" ");
}

export function filterShoppingByProject(
  items: ShoppingItem[],
  categories: ShoppingCategory[],
  projectFilter: string
): { items: ShoppingItem[]; categories: ShoppingCategory[] } {
  if (projectFilter === SHOPPING_PROJECT_ALL) {
    return { items, categories };
  }
  if (projectFilter === SHOPPING_PROJECT_NONE) {
    const nextCategories = categories.filter((category) => !category.project_id);
    const allowed = new Set(nextCategories.map((category) => category.id));
    return {
      categories: nextCategories,
      items: items.filter(
        (item) =>
          !item.shopping_category_id || allowed.has(item.shopping_category_id)
      ),
    };
  }
  const nextCategories = categories.filter(
    (category) => category.project_id === projectFilter
  );
  const allowed = new Set(nextCategories.map((category) => category.id));
  return {
    categories: nextCategories,
    items: items.filter(
      (item) =>
        item.shopping_category_id != null &&
        allowed.has(item.shopping_category_id)
    ),
  };
}

export const UNCATEGORIZED_GROUP_LABEL = "Sem categoria";

export type ShoppingGroup = {
  key: string;
  label: string;
  color: string | null;
  items: ShoppingItem[];
};

function sortPendingFirst(items: ShoppingItem[]): ShoppingItem[] {
  return [
    ...items.filter((item) => item.status === "pending"),
    ...items.filter((item) => item.status !== "pending"),
  ];
}

export function groupShoppingItems(
  items: ShoppingItem[],
  categories: ShoppingCategory[]
): ShoppingGroup[] {
  const buckets = new Map<string, ShoppingItem[]>();
  const uncategorized: ShoppingItem[] = [];

  for (const category of categories) buckets.set(category.id, []);
  for (const item of items) {
    if (!item.shopping_category_id) {
      uncategorized.push(item);
      continue;
    }
    const list = buckets.get(item.shopping_category_id);
    if (list) list.push(item);
    else uncategorized.push(item);
  }

  const groups: ShoppingGroup[] = categories
    .map((category) => ({
      key: category.id,
      label: category.name,
      color: category.color ?? null,
      items: sortPendingFirst(buckets.get(category.id) ?? []),
    }))
    .filter((group) => group.items.length > 0);

  if (uncategorized.length > 0) {
    groups.push({
      key: "uncategorized",
      label: UNCATEGORIZED_GROUP_LABEL,
      color: null,
      items: sortPendingFirst(uncategorized),
    });
  }

  return groups;
}
