import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTaskFromShoppingItem,
  fetchTaskLinksForItems,
  setShoppingItemStatus,
} from "@/api/shopping/items";

/**
 * I/O do vínculo item → tarefa (feature 051), verificado contra um duplo do query builder que
 * grava a query montada (mesma abordagem de `shopping-api.test.ts`, com `in`/`maybeSingle` a
 * mais). Prova sem navegador que: a tarefa criada nasce com o ícone e o vínculo certos; a
 * descoberta de "quais itens já têm tarefa" é **uma** consulta `in (...)` para a página inteira;
 * e a sincronização de status escreve na tabela do outro lado sem derrubar a operação principal.
 */

interface Call {
  table: string;
  op: "select" | "insert" | "update" | "delete";
  columns?: string;
  payload?: unknown;
  eq: [string, unknown][];
  in?: [string, unknown[]];
  single: boolean;
  maybeSingle: boolean;
}

const calls: Call[] = [];
type Result = { data: unknown; error: { message: string } | null };
/** Resultado por tabela; o que não estiver no mapa cai no `defaultResult`. */
let resultsByTable: Record<string, Result> = {};
let defaultResult: Result = { data: [], error: null };

function resultFor(table: string): Result {
  return resultsByTable[table] ?? defaultResult;
}

function makeBuilder(table: string) {
  const call: Call = {
    table,
    op: "select",
    eq: [],
    single: false,
    maybeSingle: false,
  };
  calls.push(call);
  const settle = () => Promise.resolve(resultFor(table));
  const builder = {
    select(columns?: string) {
      call.columns = columns;
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
    in(column: string, values: unknown[]) {
      call.in = [column, values];
      return builder;
    },
    order() {
      return settle();
    },
    single() {
      call.single = true;
      return settle();
    },
    maybeSingle() {
      call.maybeSingle = true;
      return settle();
    },
    then(resolve: (value: Result) => unknown, reject?: (reason: unknown) => unknown) {
      return settle().then(resolve, reject);
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

const ITEM = {
  id: "item-1",
  user_id: "user-1",
  shopping_category_id: "cat-1",
  title: "Café",
  description: "moído",
  quantity: 2,
  unit: "pacotes",
  provider_link: "https://loja.example/cafe",
  status: "pending",
};
const CATEGORY = { id: "cat-1", user_id: "user-1", name: "Mercado" };

beforeEach(() => {
  calls.length = 0;
  resultsByTable = {};
  defaultResult = { data: [], error: null };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

function callsTo(table: string): Call[] {
  return calls.filter((call) => call.table === table);
}

describe("createTaskFromShoppingItem", () => {
  beforeEach(() => {
    resultsByTable = {
      shopping_item: { data: ITEM, error: null },
      shopping_category: { data: CATEGORY, error: null },
      task: { data: { id: "task-1", title: "Comprar Café" }, error: null },
    };
  });

  it("lê o item e a categoria escopados no usuário antes de inserir", async () => {
    await createTaskFromShoppingItem("item-1");

    const [itemCall] = callsTo("shopping_item");
    expect(itemCall.eq).toEqual([
      ["id", "item-1"],
      ["user_id", "user-1"],
    ]);
    expect(itemCall.maybeSingle).toBe(true);

    const [categoryCall] = callsTo("shopping_category");
    expect(categoryCall.eq).toEqual([
      ["id", "cat-1"],
      ["user_id", "user-1"],
    ]);
  });

  it("insere em `task` uma tarefa com o ícone de compras e o vínculo com o item", async () => {
    await createTaskFromShoppingItem("item-1");

    const [taskCall] = callsTo("task");
    expect(taskCall.op).toBe("insert");
    const [row] = taskCall.payload as Record<string, unknown>[];
    expect(row).toMatchObject({
      title: "Comprar Café",
      icon_key: "shopping-cart",
      linked_shopping_item_id: "item-1",
      status: "todo",
      user_id: "user-1",
      completed_at: null,
    });
    expect(row.description).toContain("Mercado");
    expect(row.description).toContain("2 pacotes");
  });

  it("nunca envia recorrência — a tarefa criada não gera ocorrências", async () => {
    await createTaskFromShoppingItem("item-1");
    const [row] = callsTo("task")[0].payload as Record<string, unknown>[];
    expect(row.recurrence_rule).toBeUndefined();
    expect(row.recurrence_origin_id).toBeUndefined();
  });

  it("item já comprado nasce como tarefa concluída, com completed_at preenchido", async () => {
    resultsByTable.shopping_item = {
      data: { ...ITEM, status: "purchased" },
      error: null,
    };
    await createTaskFromShoppingItem("item-1");

    const [row] = callsTo("task")[0].payload as Record<string, unknown>[];
    expect(row.status).toBe("done");
    expect(Number.isNaN(Date.parse(row.completed_at as string))).toBe(false);
  });

  it("devolve a tarefa criada", async () => {
    await expect(createTaskFromShoppingItem("item-1")).resolves.toEqual({
      id: "task-1",
      title: "Comprar Café",
    });
  });

  it("item inexistente (ou de outro usuário) falha com mensagem amigável, sem inserir tarefa", async () => {
    resultsByTable.shopping_item = { data: null, error: null };
    await expect(createTaskFromShoppingItem("item-1")).rejects.toThrow(
      "Item não encontrado."
    );
    expect(callsTo("task")).toHaveLength(0);
  });

  /** Feature 066: item solto vira tarefa igual — e sem consultar categoria nenhuma. */
  it("item sem categoria: insere a tarefa sem tocar em shopping_category", async () => {
    resultsByTable.shopping_item = {
      data: { ...ITEM, shopping_category_id: null },
      error: null,
    };

    await createTaskFromShoppingItem("item-1");

    expect(callsTo("shopping_category")).toHaveLength(0);
    const [row] = callsTo("task")[0].payload as Record<string, unknown>[];
    expect(row).toMatchObject({
      title: "Comprar Café",
      icon_key: "shopping-cart",
      linked_shopping_item_id: "item-1",
      status: "todo",
    });
    expect(row.description).toBe(
      "Lista de Compras\n2 pacotes\nmoído\nhttps://loja.example/cafe"
    );
    expect(row.description).not.toContain("Mercado");
  });

  it("erro do banco ao inserir vira Error com a mensagem original", async () => {
    resultsByTable.task = { data: null, error: { message: "row level security" } };
    await expect(createTaskFromShoppingItem("item-1")).rejects.toThrow(
      "row level security"
    );
  });
});

describe("fetchTaskLinksForItems", () => {
  it("faz UMA consulta `in (...)` para todos os itens da página, não uma por item", async () => {
    const ids = Array.from({ length: 50 }, (_, i) => `item-${i}`);
    resultsByTable.task = { data: [], error: null };

    await fetchTaskLinksForItems(ids);

    expect(callsTo("task")).toHaveLength(1);
    expect(callsTo("task")[0].in).toEqual(["linked_shopping_item_id", ids]);
    expect(callsTo("task")[0].eq).toEqual([["user_id", "user-1"]]);
  });

  it("devolve um Map indexado pelo id do item", async () => {
    resultsByTable.task = {
      data: [
        {
          id: "task-1",
          title: "Comprar Café",
          status: "todo",
          linked_shopping_item_id: "item-1",
        },
        {
          id: "task-2",
          title: "Comprar Açúcar",
          status: "done",
          linked_shopping_item_id: "item-2",
        },
      ],
      error: null,
    };

    const links = await fetchTaskLinksForItems(["item-1", "item-2", "item-3"]);

    expect(links.get("item-1")).toEqual({
      taskId: "task-1",
      title: "Comprar Café",
      status: "todo",
    });
    expect(links.get("item-2")?.status).toBe("done");
    expect(links.has("item-3")).toBe(false);
    expect(links.size).toBe(2);
  });

  it("lista vazia não vai ao banco", async () => {
    const links = await fetchTaskLinksForItems([]);
    expect(links.size).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it("ignora linhas cujo vínculo já foi desfeito (linked_shopping_item_id nulo)", async () => {
    resultsByTable.task = {
      data: [{ id: "task-1", title: "Órfã", status: "todo", linked_shopping_item_id: null }],
      error: null,
    };
    await expect(fetchTaskLinksForItems(["item-1"])).resolves.toEqual(new Map());
  });

  it("erro do banco vira Error", async () => {
    resultsByTable.task = { data: null, error: { message: "permission denied" } };
    await expect(fetchTaskLinksForItems(["item-1"])).rejects.toThrow("permission denied");
  });
});

describe("setShoppingItemStatus — sincronização com a tarefa vinculada", () => {
  it("marcar como comprado conclui a tarefa vinculada, com completed_at", async () => {
    await setShoppingItemStatus("item-1", "purchased");

    const [taskCall] = callsTo("task");
    expect(taskCall.op).toBe("update");
    expect(taskCall.eq).toEqual([
      ["linked_shopping_item_id", "item-1"],
      ["user_id", "user-1"],
    ]);
    const payload = taskCall.payload as Record<string, unknown>;
    expect(payload.status).toBe("done");
    expect(Number.isNaN(Date.parse(payload.completed_at as string))).toBe(false);
  });

  it("desmarcar reabre a tarefa em todo e limpa completed_at", async () => {
    await setShoppingItemStatus("item-1", "pending");

    const payload = callsTo("task")[0].payload as Record<string, unknown>;
    expect(payload.status).toBe("todo");
    expect(payload.completed_at).toBeNull();
  });

  it("escreve direto em `task` — nunca via updateTask, que dispararia o sentido oposto", async () => {
    await setShoppingItemStatus("item-1", "purchased");
    // Um único UPDATE em `task`, filtrado pelo vínculo: sem SELECT prévio e sem segunda escrita
    // que caracterizariam o ping-pong entre os dois lados.
    expect(callsTo("task")).toHaveLength(1);
    expect(callsTo("shopping_item")).toHaveLength(1);
  });

  it("falha ao sincronizar a tarefa NÃO derruba a marcação do item (best-effort, só loga)", async () => {
    resultsByTable.task = { data: null, error: { message: "deu ruim" } };

    await expect(setShoppingItemStatus("item-1", "purchased")).resolves.toBeUndefined();
    expect(callsTo("shopping_item")[0].op).toBe("update");
    expect(console.error).toHaveBeenCalled();
  });

  it("falha ao gravar o próprio item continua propagando (não é best-effort)", async () => {
    resultsByTable.shopping_item = { data: null, error: { message: "row level security" } };
    await expect(setShoppingItemStatus("item-1", "purchased")).rejects.toThrow(
      "row level security"
    );
    expect(callsTo("task")).toHaveLength(0);
  });
});
