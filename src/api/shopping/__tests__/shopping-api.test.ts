import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  countShoppingCategoriesByProject,
  createShoppingCategory,
  deleteShoppingCategory,
  fetchShoppingCategories,
  updateShoppingCategory,
} from "@/api/shopping/categories";
import {
  createShoppingItem,
  deleteShoppingItem,
  fetchShoppingItems,
  setShoppingItemStatus,
  updateShoppingItem,
} from "@/api/shopping/items";

/**
 * Sem Supabase local, o I/O é verificado contra um duplo do query builder que grava a query
 * montada: tabela, filtros `eq`, ordenação e payload. É o que prova, sem navegador, que cada
 * função escreve/lê a tabela certa, sempre escopada em `user_id` (o mesmo escopo que a RLS
 * exige), e que erro do PostgREST vira `Error` para o `getErrorMessage` da UI.
 */

interface Call {
  table: string;
  op: "select" | "insert" | "update" | "delete";
  payload?: unknown;
  /** Colunas e opções passadas ao `.select()` — é onde mora o `{ count, head }` da contagem. */
  select?: [string | undefined, { count?: string; head?: boolean } | undefined];
  eq: [string, unknown][];
  order?: [string, { ascending: boolean }];
  single: boolean;
}

const calls: Call[] = [];
let nextResult: {
  data: unknown;
  error: { message: string } | null;
  count?: number | null;
} = {
  data: [],
  error: null,
};

function makeBuilder(table: string) {
  const call: Call = { table, op: "select", eq: [], single: false };
  calls.push(call);
  const builder = {
    select(
      columns?: string,
      options?: { count?: string; head?: boolean }
    ) {
      call.select = [columns, options];
      return builder;
    },
    insert(payload: unknown) {
      call.op = "insert";
      call.payload = payload;
      return builder;
    },
    update(payload: unknown) {
      call.op = "update";
      call.payload = payload;
      return builder;
    },
    delete() {
      call.op = "delete";
      return builder;
    },
    eq(column: string, value: unknown) {
      call.eq.push([column, value]);
      return builder;
    },
    order(column: string, options: { ascending: boolean }) {
      call.order = [column, options];
      return Promise.resolve(nextResult);
    },
    single() {
      call.single = true;
      return Promise.resolve(nextResult);
    },
    then(
      resolve: (value: typeof nextResult) => unknown,
      reject?: (reason: unknown) => unknown
    ) {
      return Promise.resolve(nextResult).then(resolve, reject);
    },
  };
  return builder;
}

vi.mock("@/lib/supabase", () => ({
  supabase: { from: (table: string) => makeBuilder(table) },
}));

vi.mock("@/lib/auth-user", () => ({
  getCurrentUserId: vi.fn(async () => "user-1"),
}));

beforeEach(() => {
  calls.length = 0;
  nextResult = { data: [], error: null };
});

function lastCall(): Call {
  return calls[calls.length - 1];
}

describe("api/shopping/categories", () => {
  it("fetchShoppingCategories lê shopping_category do usuário, ordenado por nome", async () => {
    const row = { id: "c1", name: "Mercado", status: undefined };
    nextResult = { data: [row], error: null };

    await expect(fetchShoppingCategories()).resolves.toEqual([row]);
    expect(lastCall().table).toBe("shopping_category");
    expect(lastCall().eq).toEqual([["user_id", "user-1"]]);
    expect(lastCall().order).toEqual(["name", { ascending: true }]);
  });

  it("fetchShoppingCategories com projectId acrescenta o filtro por projeto (feature 052)", async () => {
    const row = { id: "c1", name: "Materiais", project_id: "p1" };
    nextResult = { data: [row], error: null };

    await expect(
      fetchShoppingCategories({ projectId: "p1" })
    ).resolves.toEqual([row]);
    expect(lastCall().table).toBe("shopping_category");
    expect(lastCall().eq).toEqual([
      ["user_id", "user-1"],
      ["project_id", "p1"],
    ]);
    expect(lastCall().order).toEqual(["name", { ascending: true }]);
  });

  it("fetchShoppingCategories sem projeto (null) não filtra por project_id", async () => {
    nextResult = { data: [], error: null };
    await fetchShoppingCategories({ projectId: null });
    expect(lastCall().eq).toEqual([["user_id", "user-1"]]);
  });

  /**
   * Feature 069: a aba "Compras" da página do projeto mostra a contagem. Precisa ser contagem de
   * verdade — `head: true`, sem trazer linha — e não um `fetchShoppingCategories().length`.
   */
  it("countShoppingCategoriesByProject conta com head: true, sem trazer linhas", async () => {
    nextResult = { data: null, error: null, count: 2 };

    await expect(countShoppingCategoriesByProject("p1")).resolves.toBe(2);
    expect(lastCall().table).toBe("shopping_category");
    expect(lastCall().select).toEqual(["id", { count: "exact", head: true }]);
    expect(lastCall().eq).toEqual([
      ["user_id", "user-1"],
      ["project_id", "p1"],
    ]);
    expect(lastCall().order).toBeUndefined();
  });

  it("countShoppingCategoriesByProject devolve 0 quando o count vem nulo", async () => {
    nextResult = { data: null, error: null, count: null };
    await expect(countShoppingCategoriesByProject("p1")).resolves.toBe(0);
  });

  it("countShoppingCategoriesByProject transforma erro do PostgREST em Error", async () => {
    nextResult = { data: null, error: { message: "sem permissão" }, count: null };
    await expect(countShoppingCategoriesByProject("p1")).rejects.toThrow(
      "sem permissão"
    );
  });

  it("fetchShoppingCategories devolve [] quando o data vem nulo", async () => {
    nextResult = { data: null, error: null };
    await expect(fetchShoppingCategories()).resolves.toEqual([]);
  });

  it("createShoppingCategory injeta o user_id no insert e devolve a linha criada", async () => {
    const created = { id: "c1", name: "Mercado", user_id: "user-1" };
    nextResult = { data: created, error: null };

    await expect(
      createShoppingCategory({ name: "Mercado", description: "", color: "#22c55e" })
    ).resolves.toEqual(created);
    expect(lastCall().op).toBe("insert");
    expect(lastCall().payload).toEqual([
      { name: "Mercado", description: "", color: "#22c55e", user_id: "user-1" },
    ]);
    expect(lastCall().single).toBe(true);
  });

  it("updateShoppingCategory filtra por id + user_id e carimba updated_at", async () => {
    nextResult = { data: null, error: null };
    await updateShoppingCategory({ id: "c1", name: "Feira" });

    expect(lastCall().op).toBe("update");
    expect(lastCall().eq).toEqual([
      ["id", "c1"],
      ["user_id", "user-1"],
    ]);
    const payload = lastCall().payload as Record<string, string>;
    expect(payload.name).toBe("Feira");
    expect(Number.isNaN(Date.parse(payload.updated_at))).toBe(false);
    expect("id" in payload).toBe(false);
  });

  it("deleteShoppingCategory apaga a categoria escopada no usuário", async () => {
    nextResult = { data: null, error: null };
    await deleteShoppingCategory("c1");

    expect(lastCall().op).toBe("delete");
    expect(lastCall().table).toBe("shopping_category");
    expect(lastCall().eq).toEqual([
      ["id", "c1"],
      ["user_id", "user-1"],
    ]);
  });

  it("erro do PostgREST vira Error com a mensagem original", async () => {
    nextResult = { data: null, error: { message: "permission denied" } };
    await expect(fetchShoppingCategories()).rejects.toThrow("permission denied");
  });
});

describe("api/shopping/items", () => {
  it("fetchShoppingItems lê shopping_item do usuário na ordem de criação", async () => {
    const row = { id: "i1", shopping_category_id: "c1", title: "Café", status: "pending" };
    nextResult = { data: [row], error: null };

    await expect(fetchShoppingItems()).resolves.toEqual([row]);
    expect(lastCall().table).toBe("shopping_item");
    expect(lastCall().eq).toEqual([["user_id", "user-1"]]);
    expect(lastCall().order).toEqual(["created_at", { ascending: true }]);
  });

  it("createShoppingItem envia todos os campos do item + user_id", async () => {
    const created = { id: "i1", title: "Café", status: "pending" };
    nextResult = { data: created, error: null };

    await expect(
      createShoppingItem({
        shopping_category_id: "c1",
        title: "Café",
        description: null,
        quantity: 2,
        unit: "pacotes",
        provider_link: "https://loja.example/cafe",
        status: "pending",
      })
    ).resolves.toEqual(created);
    expect(lastCall().table).toBe("shopping_item");
    expect(lastCall().payload).toEqual([
      {
        shopping_category_id: "c1",
        title: "Café",
        description: null,
        quantity: 2,
        unit: "pacotes",
        provider_link: "https://loja.example/cafe",
        status: "pending",
        user_id: "user-1",
      },
    ]);
  });

  it("updateShoppingItem filtra por id + user_id e carimba updated_at", async () => {
    nextResult = { data: null, error: null };
    await updateShoppingItem({ id: "i1", title: "Café moído" });

    expect(lastCall().op).toBe("update");
    expect(lastCall().eq).toEqual([
      ["id", "i1"],
      ["user_id", "user-1"],
    ]);
    expect((lastCall().payload as Record<string, string>).title).toBe("Café moído");
  });

  it("setShoppingItemStatus grava o status do item alvo", async () => {
    nextResult = { data: null, error: null };
    await setShoppingItemStatus("i1", "purchased");

    // A partir da feature 051 há uma segunda escrita (sincronizar a tarefa vinculada); o que
    // interessa aqui é a primeira, no próprio item. Ver `shopping-task-link.test.ts`.
    const itemCall = calls.find((call) => call.table === "shopping_item") as Call;
    expect(itemCall.op).toBe("update");
    expect((itemCall.payload as Record<string, string>).status).toBe("purchased");
    expect(itemCall.eq).toEqual([
      ["id", "i1"],
      ["user_id", "user-1"],
    ]);
  });

  it("setShoppingItemStatus propaga erro do banco", async () => {
    nextResult = { data: null, error: { message: "row level security" } };
    await expect(setShoppingItemStatus("i1", "purchased")).rejects.toThrow(
      "row level security"
    );
  });

  it("deleteShoppingItem apaga o item escopado no usuário", async () => {
    nextResult = { data: null, error: null };
    await deleteShoppingItem("i1");

    expect(lastCall().op).toBe("delete");
    expect(lastCall().table).toBe("shopping_item");
    expect(lastCall().eq).toEqual([
      ["id", "i1"],
      ["user_id", "user-1"],
    ]);
  });
});
