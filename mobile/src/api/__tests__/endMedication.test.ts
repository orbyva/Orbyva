import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const { store } = vi.hoisted(() => ({
  store: {
    medication: [] as Row[],
    task: [] as Row[],
    ops: [] as string[],
    failOn: null as null | "medication.update" | "task.delete",
  },
}));

vi.mock("@/lib/auth-user", () => ({
  getCurrentUserId: vi.fn(async () => "user-1"),
}));

vi.mock("@/lib/supabase", () => {
  function query(table: "medication" | "task", op: "update" | "delete" | "count", payload?: Row) {
    const filters: ((row: Row) => boolean)[] = [];
    const builder = {
      eq(column: string, value: unknown) {
        filters.push((row) => row[column] === value);
        return builder;
      },
      neq(column: string, value: unknown) {
        filters.push((row) => row[column] !== value);
        return builder;
      },
      gte(column: string, value: string) {
        filters.push((row) => typeof row[column] === "string" && (row[column] as string) >= value);
        return builder;
      },
      is(column: string, value: null) {
        filters.push((row) => (row[column] ?? null) === value);
        return builder;
      },
      then(resolve: (value: unknown) => void) {
        store.ops.push(`${table}.${op}`);
        if (store.failOn === `${table}.${op}`) {
          resolve({ error: { message: "falha simulada" }, count: null });
          return;
        }
        const rows = store[table];
        const hit = rows.filter((row) => filters.every((f) => f(row)));
        if (op === "update") hit.forEach((row) => Object.assign(row, payload));
        if (op === "delete") store[table] = rows.filter((row) => !hit.includes(row));
        resolve({ error: null, count: op === "count" ? hit.length : null });
      },
    };
    return builder;
  }
  return {
    supabase: {
      from: (table: "medication" | "task") => ({
        update: (payload: Row) => query(table, "update", payload),
        delete: () => query(table, "delete"),
        select: () => query(table, "count"),
      }),
    },
  };
});

import { EndMedicationError, endMedicationAndDeleteFutureDoses } from "@/api/health/health";
import { getTodayIso } from "@/domain/habits";

function isoOffset(days: number): string {
  const [y, m, d] = getTodayIso().split("-").map(Number);
  const date = new Date(y, m - 1, d + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

describe("endMedicationAndDeleteFutureDoses (mobile)", () => {
  beforeEach(() => {
    store.ops = [];
    store.failOn = null;
    store.medication = [{ id: "med-1", user_id: "user-1", active: true }];
    store.task = [
      { id: "past", user_id: "user-1", medication_id: "med-1", due_date: isoOffset(-1), status: "todo", completed_at: null },
      { id: "today-taken", user_id: "user-1", medication_id: "med-1", due_date: isoOffset(0), status: "done", completed_at: "x" },
      { id: "today-pending", user_id: "user-1", medication_id: "med-1", due_date: isoOffset(0), status: "todo", completed_at: null },
      { id: "future", user_id: "user-1", medication_id: "med-1", due_date: isoOffset(3), status: "todo", completed_at: null },
      { id: "other-med", user_id: "user-1", medication_id: "med-2", due_date: isoOffset(3), status: "todo", completed_at: null },
    ];
  });

  it("encerra antes de apagar e apaga só doses futuras não tomadas deste tratamento", async () => {
    const removed = await endMedicationAndDeleteFutureDoses("med-1");
    expect(store.ops).toEqual(["medication.update", "task.count", "task.delete"]);
    expect(store.medication[0].active).toBe(false);
    expect(removed).toBe(2);
    expect(store.task.map((t) => t.id).sort()).toEqual(["other-med", "past", "today-taken"]);
  });

  it("se encerrar falha, nada é apagado", async () => {
    store.failOn = "medication.update";
    const err = await endMedicationAndDeleteFutureDoses("med-1").catch((e) => e);
    expect(err).toBeInstanceOf(EndMedicationError);
    expect(err.stage).toBe("deactivate");
    expect(store.ops).toEqual(["medication.update"]);
    expect(store.task).toHaveLength(5);
  });

  it("se apagar falha, o erro diz que o tratamento já foi encerrado", async () => {
    store.failOn = "task.delete";
    const err = await endMedicationAndDeleteFutureDoses("med-1").catch((e) => e);
    expect(err).toBeInstanceOf(EndMedicationError);
    expect(err.stage).toBe("delete");
    expect(err.message).toMatch(/foi encerrado/);
    expect(store.medication[0].active).toBe(false);
  });
});
