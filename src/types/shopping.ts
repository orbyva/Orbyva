export type ShoppingItemStatus = "pending" | "purchased";

export interface ShoppingCategory {
  id: string;
  user_id?: string;
  name: string;
  description?: string | null;
  color?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type ShoppingCategoryCreateRequest = Omit<
  ShoppingCategory,
  "id" | "user_id" | "created_at" | "updated_at"
>;

export type ShoppingCategoryUpdateRequest =
  Partial<ShoppingCategoryCreateRequest> & { id: string };

export interface ShoppingItem {
  id: string;
  user_id?: string;
  shopping_category_id: string;
  title: string;
  description?: string | null;
  /** Quantidade livre (numeric no banco) — casa com `unit`, que também é texto livre. */
  quantity?: number | null;
  /** Unidade livre ("kg", "caixas", "m") — não há catálogo fechado. */
  unit?: string | null;
  /** URL do produto no fornecedor, preenchida à mão. */
  provider_link?: string | null;
  status: ShoppingItemStatus;
  created_at?: string;
  updated_at?: string;
}

export type ShoppingItemCreateRequest = Omit<
  ShoppingItem,
  "id" | "user_id" | "created_at" | "updated_at"
>;

export type ShoppingItemUpdateRequest = Partial<ShoppingItemCreateRequest> & {
  id: string;
};
