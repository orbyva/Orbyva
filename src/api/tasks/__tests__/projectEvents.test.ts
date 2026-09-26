import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createProjectEvent,
  updateProjectEvent,
} from "@/api/tasks/projectEvents";

/**
 * Contrato de escrita dos eventos de agenda (feature 066), verificado contra um duplo do query
 * builder — sem navegador e sem banco. Prova o que a migration abriu: `createProjectEvent` grava
 * evento de tarefa e evento avulso (`project_id: null`), e o `updateProjectEvent` novo filtra por
 * `id` + `user_id` e devolve a linha atualizada.
 */

interface Call {
  table: string;
  op: "select" | "insert" | "update" | "delete";
  payload?: unknown;
  eq: [string, unknown][];
  selected: boolean;
  single: boolean;
}

const calls: Call[] = [];
type Result = { data: unknown; error: { message: string } | null };
let result: Result = { data: null, error: null };

function makeBuilder(table: string) {
  const call: Call = { table, op: "select", eq: [], selected: false, single: false };
  calls.push(call);
  const settle = () => Promise.resolve(result);
  const builder = {
    select() {
      call.selected = true;
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
    eq(column: string, value: unknown) {
      call.eq.push([column, value]);
      return builder;
    },
    single() {
      call.single = true;
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

beforeEach(() => {
  calls.length = 0;
  result = { data: null, error: null };
});

describe("createProjectEvent — os três estados de vínculo", () => {
  it("grava evento de tarefa com project_id nulo", async () => {
    result = { data: { id: "ev-1" }, error: null };

    await createProjectEvent({
      project_id: null,
      task_id: "task-1",
      title: "Reunião sobre a tarefa",
      starts_at: "2026-08-20T10:00:00.000Z",
      ends_at: null,
    });

    const [call] = calls;
    expect(call.table).toBe("project_event");
    expect(call.op).toBe("insert");
    expect(call.payload).toEqual([
      {
        project_id: null,
        task_id: "task-1",
        title: "Reunião sobre a tarefa",
        starts_at: "2026-08-20T10:00:00.000Z",
        ends_at: null,
        user_id: "user-1",
      },
    ]);
  });

  it("grava evento avulso sem nenhum dos dois vínculos", async () => {
    result = { data: { id: "ev-2" }, error: null };

    await createProjectEvent({
      project_id: null,
      task_id: null,
      title: "Dentista",
      starts_at: "2026-08-20T15:00:00.000Z",
    });

    const payload = (calls[0].payload as Record<string, unknown>[])[0];
    expect(payload.project_id).toBeNull();
    expect(payload.task_id).toBeNull();
    expect(payload.user_id).toBe("user-1");
  });

  it("evento de projeto continua funcionando como antes", async () => {
    result = { data: { id: "ev-3" }, error: null };

    await createProjectEvent({
      project_id: "proj-1",
      task_id: null,
      title: "Kickoff",
      starts_at: "2026-08-20T09:00:00.000Z",
    });

    const payload = (calls[0].payload as Record<string, unknown>[])[0];
    expect(payload.project_id).toBe("proj-1");
    expect(payload.task_id).toBeNull();
  });
});

describe("updateProjectEvent", () => {
  it("atualiza só os campos enviados, filtrando por id + user_id, e devolve a linha", async () => {
    result = {
      data: {
        id: "ev-1",
        user_id: "user-1",
        project_id: null,
        task_id: "task-1",
        title: "Reunião remarcada",
        starts_at: "2026-08-21T10:00:00.000Z",
      },
      error: null,
    };

    const updated = await updateProjectEvent({
      id: "ev-1",
      title: "Reunião remarcada",
      starts_at: "2026-08-21T10:00:00.000Z",
    });

    const [call] = calls;
    expect(call.table).toBe("project_event");
    expect(call.op).toBe("update");
    // `id` sai do payload (vira filtro) e nada de `updated_at`: project_event não tem essa coluna.
    expect(call.payload).toEqual({
      title: "Reunião remarcada",
      starts_at: "2026-08-21T10:00:00.000Z",
    });
    expect(call.eq).toEqual([
      ["id", "ev-1"],
      ["user_id", "user-1"],
    ]);
    expect(call.selected).toBe(true);
    expect(call.single).toBe(true);
    expect(updated.title).toBe("Reunião remarcada");
    expect(updated.task_id).toBe("task-1");
  });

  it("troca o vínculo de projeto para tarefa gravando os dois campos", async () => {
    result = { data: { id: "ev-1" }, error: null };

    await updateProjectEvent({
      id: "ev-1",
      project_id: null,
      task_id: "task-2",
    });

    expect(calls[0].payload).toEqual({ project_id: null, task_id: "task-2" });
  });

  it("propaga o erro do Supabase como Error", async () => {
    result = { data: null, error: { message: "row level security" } };

    await expect(updateProjectEvent({ id: "ev-1", title: "x" })).rejects.toThrow(
      "row level security"
    );
  });
});
