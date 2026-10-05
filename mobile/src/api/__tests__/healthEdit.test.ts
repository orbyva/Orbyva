import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const { db } = vi.hoisted(() => ({
  db: {
    health_metric: [] as Row[],
    task: [] as Row[],
    calls: [] as { table: string; op: string; payload?: unknown; filters: [string, unknown][] }[],
  },
}));

vi.mock("@/lib/auth-user", () => ({ getCurrentUserId: vi.fn(async () => "me") }));

vi.mock("@/lib/supabase", () => {
  function table(name: "health_metric" | "task") {
    const filters: [string, unknown][] = [];
    let op = "select";
    let payload: unknown;
    const rows = () => db[name].filter((r) => filters.every(([k, v]) => r[k] === v));
    const record = () => db.calls.push({ table: name, op, payload, filters: [...filters] });
    const builder: Record<string, unknown> = {
      select: () => builder,
      order: () => builder,
      limit: () => builder,
      update: (p: unknown) => ((op = "update"), (payload = p), builder),
      delete: () => ((op = "delete"), builder),
      eq: (k: string, v: unknown) => (filters.push([k, v]), builder),
      maybeSingle: async () => (record(), { data: rows()[0] ?? null, error: null }),
      single: async () => {
        record();
        const hit = rows()[0];
        if (op === "update" && hit) Object.assign(hit, payload as Row);
        return { data: hit ?? null, error: hit ? null : { message: "not found" } };
      },
      then: (resolve: (v: unknown) => void) => {
        record();
        if (op === "delete") {
          db[name] = db[name].filter((r) => !filters.every(([k, v]) => r[k] === v));
          return resolve({ error: null });
        }
        return resolve({ data: rows(), error: null });
      },
    };
    return builder;
  }
  return { supabase: { from: (name: "health_metric" | "task") => table(name) } };
});

import {
  deleteHealthMetric,
  fetchConsultationTasks,
  fetchHealthMetricById,
  updateHealthMetric,
} from "@/api/health/health";
import { partitionConsultationHistory } from "@/domain/health/consultations";
import type { Task } from "@/types/tasks";

beforeEach(() => {
  db.health_metric = [
    { id: "m1", user_id: "me", metric_type: "weight", value: 80, recorded_date: "2026-10-01", notes: null },
    { id: "m2", user_id: "other", metric_type: "weight", value: 70, recorded_date: "2026-10-01", notes: null },
  ];
  db.task = [];
  db.calls = [];
});

describe("medições", () => {
  it("busca por id só do próprio usuário", async () => {
    expect((await fetchHealthMetricById("m1"))?.value).toBe(80);
    expect(await fetchHealthMetricById("m2")).toBeNull();
  });

  it("atualiza valor/data/nota sem trocar o tipo e limpa nota em branco", async () => {
    const updated = await updateHealthMetric({
      id: "m1",
      value: 79.5,
      recorded_date: "2026-10-02",
      notes: "   ",
    });
    expect(updated).toMatchObject({ value: 79.5, recorded_date: "2026-10-02", notes: null, metric_type: "weight" });
    expect(db.calls.at(-1)?.payload).not.toHaveProperty("metric_type");
  });

  it("exclui filtrando pelo dono", async () => {
    await deleteHealthMetric("m1");
    expect(db.health_metric.map((r) => r.id)).toEqual(["m2"]);
    expect(db.calls.at(-1)?.filters).toContainEqual(["user_id", "me"]);
  });
});

describe("consultas", () => {
  it("lista só consultas do usuário", async () => {
    db.task = [
      { id: "c1", user_id: "me", is_consultation: true },
      { id: "t1", user_id: "me", is_consultation: false },
      { id: "c2", user_id: "other", is_consultation: true },
    ];
    expect((await fetchConsultationTasks()).map((t) => t.id)).toEqual(["c1"]);
  });

  it("separa próximas (cedo → tarde) e histórico (recente → antigo)", () => {
    const t = (id: string, status: string, due_date: string, due_time: string | null = null) =>
      ({ id, status, due_date, due_time }) as unknown as Task;
    const { upcoming, history } = partitionConsultationHistory([
      t("a", "todo", "2026-11-10"),
      t("b", "todo", "2026-10-20", "09:00"),
      t("c", "done", "2026-09-01"),
      t("d", "done", "2026-09-15"),
      t("e", "doing", "2026-10-20", "08:00"),
    ]);
    expect(upcoming.map((x) => x.id)).toEqual(["e", "b", "a"]);
    expect(history.map((x) => x.id)).toEqual(["d", "c"]);
  });
});
