import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateProjectEvent } from "@/api/tasks/projectEvents";

/**
 * Feature 103 — `project_event` ganhou update. Até aqui só existiam `fetch`/`create`/`delete`: um
 * evento no horário errado só se consertava apagando e recriando, e criar pela Agenda (ou por
 * arrasto, na 104) sem conserto seria pior do que não criar.
 *
 * O que este arquivo tranca é o **escopo da escrita**: o `update` sai filtrado por `id` **e**
 * `user_id`, como `deleteProjectEvent` já fazia. A RLS por `user_id` é a barreira real, mas repetir
 * o dono no filtro é o que impede um `id` vazado de virar um `update` de escopo aberto se a
 * política mudar — e é exatamente o tipo de detalhe que some num refactor sem teste.
 */

interface Call {
  table: string;
  op: "select" | "update";
  payload?: Record<string, unknown>;
  eq: [string, unknown][];
  single: boolean;
}

const calls: Call[] = [];
type Result = { data: unknown; error: { message: string } | null };
let result: Result = { data: null, error: null };

function makeBuilder(table: string) {
  const call: Call = { table, op: "select", eq: [], single: false };
  calls.push(call);
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
      call.eq.push([column, value]);
      return builder;
    },
    single() {
      call.single = true;
      return Promise.resolve(result);
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

describe("updateProjectEvent (feature 103)", () => {
  it("atualiza filtrando por id E user_id, e devolve a linha gravada", async () => {
    const row = {
      id: "ev-1",
      project_id: null,
      title: "Dentista",
      starts_at: "2026-09-02T15:00:00.000Z",
      ends_at: null,
    };
    result = { data: row, error: null };

    const updated = await updateProjectEvent({
      id: "ev-1",
      title: "Dentista",
      starts_at: "2026-09-02T15:00:00.000Z",
      ends_at: null,
    });

    const call = calls.find((c) => c.table === "project_event" && c.op === "update");
    expect(call).toBeDefined();
    // O `id` é filtro, não payload — mandá-lo no `update` reescreveria a PK.
    expect(call?.payload).toEqual({
      title: "Dentista",
      starts_at: "2026-09-02T15:00:00.000Z",
      ends_at: null,
    });
    expect(call?.eq).toEqual([
      ["id", "ev-1"],
      ["user_id", "user-1"],
    ]);
    expect(call?.single).toBe(true);
    expect(updated).toEqual(row);
  });

  it("update parcial manda só os campos passados (não zera os outros)", async () => {
    result = { data: { id: "ev-1" }, error: null };

    await updateProjectEvent({ id: "ev-1", starts_at: "2026-09-03T09:00:00.000Z" });

    const call = calls.find((c) => c.table === "project_event" && c.op === "update");
    expect(call?.payload).toEqual({ starts_at: "2026-09-03T09:00:00.000Z" });
    expect(call?.eq).toContainEqual(["user_id", "user-1"]);
  });

  it("erro do supabase vira Error com a mensagem, como nas irmãs", async () => {
    result = { data: null, error: { message: "row-level security" } };

    await expect(updateProjectEvent({ id: "ev-1", title: "x" })).rejects.toThrow(
      "row-level security"
    );
  });
});
