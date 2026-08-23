import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateTask } from "@/api/tasks";

/**
 * Feature 073 — o ícone é propriedade da série recorrente, não da ocorrência. O Supabase falso
 * abaixo guarda linhas de verdade e aplica os `update` sobre elas (inclusive o `.or(...)` do
 * fan-out), então as assertivas olham o **estado final das tarefas**, não só a query montada: é o
 * que prova, sem navegador e sem banco, que trocar o ícone numa ocorrência alcança a origem e as
 * irmãs — e que uma tarefa avulsa continua com um `update` só.
 */

interface Row {
  id: string;
  user_id: string;
  recurrence_rule: unknown;
  recurrence_origin_id: string | null;
  icon_key: string | null;
  icon_url: string | null;
  [key: string]: unknown;
}

interface Call {
  op: "select" | "update";
  payload?: Record<string, unknown>;
  filters: string[];
}

const { store } = vi.hoisted(() => ({
  store: { rows: [] as Row[], calls: [] as Call[], failFanOut: false },
}));

vi.mock("@/lib/auth-user", () => ({
  getCurrentUserId: vi.fn(async () => "user-1"),
}));

vi.mock("@/lib/supabase", () => {
  /** `id.eq.abc,recurrence_origin_id.eq.abc` → true se a linha casa com alguma cláusula. */
  function matchesOr(row: Row, expression: string): boolean {
    return expression.split(",").some((clause) => {
      const [column, op, value] = clause.split(".");
      if (op !== "eq") throw new Error(`operador não suportado no or(): ${op}`);
      return row[column] === value;
    });
  }

  function from(table: string) {
    if (table !== "task") throw new Error(`tabela inesperada: ${table}`);
    const call: Call = { op: "select", filters: [] };
    store.calls.push(call);
    const eqs: [string, unknown][] = [];
    let orExpression: string | null = null;

    function selected(): Row[] {
      return store.rows.filter(
        (row) =>
          eqs.every(([column, value]) => row[column] === value) &&
          (orExpression === null || matchesOr(row, orExpression))
      );
    }

    function settle() {
      if (call.op === "update") {
        // Simula a falha do fan-out (o único `update` que usa `.or`) para provar que o erro sobe.
        if (orExpression !== null && store.failFanOut) {
          return Promise.resolve({ data: null, error: { message: "boom" } });
        }
        for (const row of selected()) Object.assign(row, call.payload);
        return Promise.resolve({ data: null, error: null });
      }
      return Promise.resolve({ data: selected(), error: null });
    }

    const builder = {
      select() {
        return builder;
      },
      update(payload: Record<string, unknown>) {
        call.op = "update";
        call.payload = payload;
        return builder;
      },
      eq(column: string, value: unknown) {
        eqs.push([column, value]);
        call.filters.push(`${column}.eq.${value}`);
        return builder;
      },
      or(expression: string) {
        orExpression = expression;
        call.filters.push(`or(${expression})`);
        return builder;
      },
      maybeSingle() {
        return Promise.resolve({ data: selected()[0] ?? null, error: null });
      },
      then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
        return settle().then(resolve, reject);
      },
    };
    return builder;
  }

  return { supabase: { from } };
});

function row(overrides: Partial<Row> & { id: string }): Row {
  return {
    user_id: "user-1",
    recurrence_rule: null,
    recurrence_origin_id: null,
    icon_key: null,
    icon_url: null,
    ...overrides,
  };
}

/** Série: origem com regra + três ocorrências materializadas apontando pra ela. */
function serie(): Row[] {
  return [
    row({ id: "origem", recurrence_rule: { frequency: "weekly", interval: 1 } }),
    row({ id: "oco-1", recurrence_origin_id: "origem" }),
    row({ id: "oco-2", recurrence_origin_id: "origem" }),
    row({ id: "oco-3", recurrence_origin_id: "origem" }),
    // Outra série, que não pode ser tocada pelo fan-out.
    row({ id: "outra-origem", recurrence_rule: { frequency: "daily", interval: 1 } }),
    row({ id: "outra-oco", recurrence_origin_id: "outra-origem" }),
  ];
}

function icons(ids: string[]) {
  return ids.map((id) => {
    const found = store.rows.find((r) => r.id === id)!;
    return [found.id, found.icon_key, found.icon_url];
  });
}

beforeEach(() => {
  store.rows = [];
  store.calls = [];
  store.failFanOut = false;
});

describe("propagateIconToSeries", () => {
  it("ícone escolhido numa ocorrência vale para a origem e todas as irmãs", async () => {
    store.rows = serie();

    await updateTask({ id: "oco-2", icon_key: "dumbbell", icon_url: null });

    expect(icons(["origem", "oco-1", "oco-2", "oco-3"])).toEqual([
      ["origem", "dumbbell", null],
      ["oco-1", "dumbbell", null],
      ["oco-2", "dumbbell", null],
      ["oco-3", "dumbbell", null],
    ]);
    // Série vizinha intacta.
    expect(icons(["outra-origem", "outra-oco"])).toEqual([
      ["outra-origem", null, null],
      ["outra-oco", null, null],
    ]);
  });

  it("ícone escolhido na origem desce para todas as ocorrências", async () => {
    store.rows = serie();

    await updateTask({ id: "origem", icon_url: "https://cdn.example/user-1/origem.png", icon_key: null });

    expect(icons(["origem", "oco-1", "oco-2", "oco-3"])).toEqual([
      ["origem", null, "https://cdn.example/user-1/origem.png"],
      ["oco-1", null, "https://cdn.example/user-1/origem.png"],
      ["oco-2", null, "https://cdn.example/user-1/origem.png"],
      ["oco-3", null, "https://cdn.example/user-1/origem.png"],
    ]);
  });

  it("ocorrência de série vinculada à Recorrência Financeira entra no mesmo escopo", async () => {
    store.rows = [
      row({ id: "template", recurrence_rule: null, linked_recurring_id: "rec-1" }),
      row({ id: "parcela-1", recurrence_origin_id: "template", linked_recurring_id: "rec-1" }),
      row({ id: "parcela-2", recurrence_origin_id: "template", linked_recurring_id: "rec-1" }),
    ];

    await updateTask({ id: "parcela-2", icon_key: "wifi", icon_url: null });

    expect(icons(["template", "parcela-1", "parcela-2"])).toEqual([
      ["template", "wifi", null],
      ["parcela-1", "wifi", null],
      ["parcela-2", "wifi", null],
    ]);
  });

  it("remover o ícone limpa a série inteira", async () => {
    store.rows = serie().map((r) =>
      ["origem", "oco-1", "oco-2", "oco-3"].includes(r.id) ? { ...r, icon_key: "dumbbell" } : r
    );

    await updateTask({ id: "oco-1", icon_key: null, icon_url: null });

    expect(icons(["origem", "oco-1", "oco-2", "oco-3"])).toEqual([
      ["origem", null, null],
      ["oco-1", null, null],
      ["oco-2", null, null],
      ["oco-3", null, null],
    ]);
  });

  it("tarefa avulsa faz um update só, sem fan-out", async () => {
    store.rows = [row({ id: "avulsa" }), row({ id: "vizinha" })];

    await updateTask({ id: "avulsa", icon_key: "star", icon_url: null });

    expect(icons(["avulsa", "vizinha"])).toEqual([
      ["avulsa", "star", null],
      ["vizinha", null, null],
    ]);
    // Um `update` (o da própria tarefa) + o `select` que descobre que não há série — e nada além.
    expect(store.calls.map((c) => c.op)).toEqual(["update", "select"]);
  });

  it("dose de medicação não é série: o ícone fica só na dose", async () => {
    store.rows = [
      row({ id: "dose-1", medication_id: "med-1", icon_key: "pill" }),
      row({ id: "dose-2", medication_id: "med-1", icon_key: "pill" }),
    ];

    await updateTask({ id: "dose-1", icon_key: "heart", icon_url: null });

    expect(icons(["dose-1", "dose-2"])).toEqual([
      ["dose-1", "heart", null],
      ["dose-2", "pill", null],
    ]);
  });

  it("update sem campo de ícone no payload não dispara select nem update extra", async () => {
    store.rows = serie();

    await updateTask({ id: "oco-2", title: "Novo título" });

    expect(store.calls.map((c) => c.op)).toEqual(["update"]);
    expect(store.calls[0].filters).toEqual(["id.eq.oco-2", "user_id.eq.user-1"]);
  });

  it("falha na propagação sobe para o chamador (não é engolida como os syncs)", async () => {
    // A propagação **é** o comportamento pedido, então a falha não pode sumir num `console.error`
    // como as sincronizações de parcela/compras — tem que virar toast no chamador.
    store.rows = serie();
    store.failFanOut = true;

    await expect(updateTask({ id: "oco-2", icon_key: "star", icon_url: null })).rejects.toThrow(
      "boom"
    );
  });
});
