import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateTask } from "@/api/tasks/tasks";

/**
 * Lado "tarefa → item" da sincronização do vínculo (feature 051), verificado contra um duplo do
 * query builder. Prova sem navegador que concluir/reabrir a tarefa escreve o status derivado
 * direto em `shopping_item` — sem chamar `setShoppingItemStatus`, que sincronizaria de volta e
 * criaria ping-pong — e que a falha dessa sincronização nunca derruba o update da tarefa.
 */

interface Call {
  table: string;
  op: "select" | "insert" | "update" | "delete";
  columns?: string;
  payload?: unknown;
  eq: [string, unknown][];
  maybeSingle: boolean;
}

const calls: Call[] = [];
type Result = { data: unknown; error: { message: string } | null };
let resultsByTable: Record<string, Result> = {};

function makeBuilder(table: string) {
  const call: Call = { table, op: "select", eq: [], maybeSingle: false };
  calls.push(call);
  const settle = () =>
    Promise.resolve(resultsByTable[table] ?? { data: null, error: null });
  const builder = {
    select(columns?: string) {
      call.columns = columns;
      return builder;
    },
    update(payload: unknown) {
      call.op = "update";
      call.payload = payload;
      return builder;
    },
    eq(column: string, value: unknown) {
      call.eq.push([column, value]);
      return builder;
    },
    maybeSingle() {
      call.maybeSingle = true;
      return settle();
    },
    single() {
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

// A sincronização com Recorrência Financeira (feature 002) roda no mesmo ponto; aqui ela é
// neutralizada pra que as asserções falem só do vínculo com a Lista de Compras.
vi.mock("@/api/recurring", () => ({
  fetchRecurringTransactionsByIds: vi.fn(async () => []),
  updateRecurringParcelPayment: vi.fn(async () => {}),
}));

beforeEach(() => {
  calls.length = 0;
  resultsByTable = {};
  vi.spyOn(console, "error").mockImplementation(() => {});
});

function callsTo(table: string): Call[] {
  return calls.filter((call) => call.table === table);
}

describe("updateTask — sincronização com o item da Lista de Compras vinculado", () => {
  it("concluir a tarefa marca o item vinculado como comprado", async () => {
    resultsByTable.task = {
      data: { linked_shopping_item_id: "item-1", linked_installment_number: null },
      error: null,
    };

    await updateTask({ id: "task-1", status: "done" });

    const [itemCall] = callsTo("shopping_item");
    expect(itemCall.op).toBe("update");
    expect((itemCall.payload as Record<string, unknown>).status).toBe("purchased");
    expect(itemCall.eq).toEqual([
      ["id", "item-1"],
      ["user_id", "user-1"],
    ]);
  });

  it("reabrir a tarefa devolve o item para pendente", async () => {
    resultsByTable.task = {
      data: { linked_shopping_item_id: "item-1", linked_installment_number: null },
      error: null,
    };

    await updateTask({ id: "task-1", status: "todo" });

    expect((callsTo("shopping_item")[0].payload as Record<string, unknown>).status).toBe(
      "pending"
    );
  });

  it("tarefa em doing também deixa o item pendente", async () => {
    resultsByTable.task = {
      data: { linked_shopping_item_id: "item-1", linked_installment_number: null },
      error: null,
    };

    await updateTask({ id: "task-1", status: "doing" });

    expect((callsTo("shopping_item")[0].payload as Record<string, unknown>).status).toBe(
      "pending"
    );
  });

  it("tarefa sem vínculo não toca em shopping_item", async () => {
    resultsByTable.task = {
      data: { linked_shopping_item_id: null, linked_installment_number: null },
      error: null,
    };

    await updateTask({ id: "task-1", status: "done" });

    expect(callsTo("shopping_item")).toHaveLength(0);
  });

  it("update que não mexe em status não dispara sincronização nenhuma", async () => {
    resultsByTable.task = {
      data: { linked_shopping_item_id: "item-1", linked_installment_number: null },
      error: null,
    };

    await updateTask({ id: "task-1", title: "Comprar Café moído" });

    expect(callsTo("shopping_item")).toHaveLength(0);
    // Só o UPDATE da própria tarefa, sem o SELECT do vínculo.
    expect(callsTo("task")).toHaveLength(1);
    expect(callsTo("task")[0].op).toBe("update");
  });

  it("falha ao sincronizar o item NÃO derruba o update da tarefa (best-effort, só loga)", async () => {
    resultsByTable.task = {
      data: { linked_shopping_item_id: "item-1", linked_installment_number: null },
      error: null,
    };
    resultsByTable.shopping_item = { data: null, error: { message: "deu ruim" } };

    await expect(updateTask({ id: "task-1", status: "done" })).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith(
      "Falha ao sincronizar item de compras vinculado:",
      expect.any(Error)
    );
  });

  it("erro no update da própria tarefa continua propagando (não é best-effort)", async () => {
    let first = true;
    resultsByTable = {};
    Object.defineProperty(resultsByTable, "task", {
      get() {
        if (first) {
          first = false;
          return { data: null, error: { message: "row level security" } };
        }
        return { data: null, error: null };
      },
    });

    await expect(updateTask({ id: "task-1", status: "done" })).rejects.toThrow(
      "row level security"
    );
    expect(callsTo("shopping_item")).toHaveLength(0);
  });
});
