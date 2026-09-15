export type ShoppingItemStatus = "pending" | "purchased";

export interface ShoppingCategory {
  id: string;
  name: string;
  color?: string | null;
  project_id?: string | null;
}

export interface ShoppingItem {
  id: string;
  title: string;
  status: ShoppingItemStatus;
  shopping_category_id: string | null;
  description?: string | null;
  quantity?: number | null;
  unit?: string | null;
  provider_link?: string | null;
}
