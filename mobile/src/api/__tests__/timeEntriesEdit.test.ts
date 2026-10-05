import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
type Call = { table: string; op: string; payload?: unknown; filters: [string, unknown][] };

const { db } = vi.hoisted(() => ({
  db: { tables: {} as Record<string, Row[]>, calls: [] as Call[] },
}));

vi.mock("@/lib/auth-user", () => ({ getCurrentUserId: vi.fn(async () => "me") }));

vi.mock("@/lib/supabase", () => {
  function table(name: string) {
    const filters: [string, unknown][] = [];
    let op = "select";
    let payload: unknown;
    const rows = () => (db.tables[name] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v));
    const record = () => db.calls.push({ table: name, op, payload, filters: [...filters] });
    const builder: Record<string, unknown> = {
      select: () => builder,
      order: () => builder,
      update: (p: unknown) => ((op = "update"), (payload = p), builder),
      eq: (k: string, v: unknown) => (filters.push([k, v]), builder),
      single: async () => {
        record();
        const hit = rows()[0];
        if (op === "update" && hit) Object.assign(hit, payload as Row);
        return { data: hit ?? null, error: hit ? null : { message: "not found" } };
      },
      then: (resolve: (v: unknown) => void) => {
        record();
        if (op === "update") rows().forEach((r) => Object.assign(r, payload as Row));
        return resolve({ data: rows(), error: null });
      },
    };
    return builder;
  }
  return { supabase: { from: table } };
});

import { updateProjectEventApi } from "@/api/tasks/events";
import { setTaskDueApi, updateTaskApi } from "@/api/tasks/tasks";
import { fetchEntriesForTask, updateTimeEntry } from "@/api/tasks/timeEntries";

beforeEach(() => {
  db.calls = [];
  db.tables = {
    task_time_entry: [
      { id: "e1", user_id: "me", task_id: "t1", started_at: "2026-10-05T10:00:00.000Z", ended_at: "2026-10-05T11:00:00.000Z" },
      { id: "e2", user_id: "me", task_id: "t2", started_at: "2026-10-05T12:00:00.000Z", ended_at: null },
      { id: "e3", user_id: "other", task_id: "t1", started_at: "2026-10-05T09:00:00.000Z", ended_at: null },
    ],
    project_event: [
      { id: "ev1", user_id: "me", project_id: "p1", title: "Kickoff", starts_at: "2026-10-10T12:00:00.000Z" },
    ],
    task: [
      { id: "t1", user_id: "me", title: "A", priority: "high", due_date: null, due_time: null },
    ],
  };
});

describe("registros de tempo", () => {
  it("lista só os registros da tarefa e do usuário", async () => {
    expect((await fetchEntriesForTask("t1")).map((e) => e.id)).toEqual(["e1"]);
  });

  it("edita início e fim", async () => {
    const updated = await updateTimeEntry("e1", {
      started_at: "2026-10-05T09:30:00.000Z",
      ended_at: "2026-10-05T11:15:00.000Z",
    });
    expect(updated).toMatchObject({ started_at: "2026-10-05T09:30:00.000Z", ended_at: "2026-10-05T11:15:00.000Z" });
    expect(db.calls.at(-1)?.filters).toContainEqual(["user_id", "me"]);
  });

  it("recusa fim antes do início sem tocar no banco", async () => {
    await expect(
      updateTimeEntry("e1", { started_at: "2026-10-05T12:00:00.000Z", ended_at: "2026-10-05T11:00:00.000Z" })
    ).rejects.toThrow("O fim precisa ser depois do início.");
    expect(db.calls).toHaveLength(0);
  });
});

describe("evento do projeto", () => {
  it("atualiza título (aparado) e início", async () => {
    const updated = await updateProjectEventApi({
      id: "ev1",
      title: "  Kickoff v2 ",
      startsAt: "2026-10-11T13:00:00.000Z",
    });
    expect(updated).toMatchObject({ title: "Kickoff v2", starts_at: "2026-10-11T13:00:00.000Z" });
  });

  it("recusa título vazio", async () => {
    await expect(updateProjectEventApi({ id: "ev1", title: "   " })).rejects.toThrow(
      "Informe o título do evento."
    );
  });
});

describe("marco", () => {
  it("updateTaskApi grava is_milestone só quando informado", async () => {
    await updateTaskApi({ id: "t1", title: "A", due_date: null, is_milestone: true });
    expect(db.calls.at(-1)?.payload).toMatchObject({ is_milestone: true });
    await updateTaskApi({ id: "t1", title: "A", due_date: null });
    expect(db.calls.at(-1)?.payload).not.toHaveProperty("is_milestone");
  });
});

describe("prazo do começar agora", () => {
  it("grava só prazo, sem apagar prioridade", async () => {
    await setTaskDueApi("t1", { due_date: "2026-10-05", due_time: "15:10" });
    const payload = db.calls.at(-1)?.payload as Row;
    expect(Object.keys(payload).sort()).toEqual(["due_date", "due_time", "updated_at"]);
    expect(db.tables.task[0]).toMatchObject({ priority: "high", due_date: "2026-10-05", due_time: "15:10" });
  });
});
