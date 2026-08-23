export type ShoppingItemStatus = "pending" | "purchased";

export interface ShoppingCategory {
  id: string;
  user_id?: string;
  name: string;
  description?: string | null;
  color?: string | null;
  /**
   * Projeto ao qual a categoria pertence (feature 052). Nulo = categoria comum da casa, que não
   * aparece em filtro de projeto nenhum. O vínculo é da categoria, nunca do item — o item herda o
   * projeto pela categoria em que está.
   */
  project_id?: string | null;
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
  /**
   * Categoria do item (feature 066). Nulo = item solto, ainda sem categoria — categoria é
   * organização opcional, não pedágio de entrada. Item solto aparece no pseudo-grupo
   * "Sem categoria" e, por não ter categoria, não pertence a projeto nenhum (o vínculo com
   * projeto é da categoria — feature 052).
   */
  shopping_category_id: string | null;
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
