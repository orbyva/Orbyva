import { describe, expect, it } from "vitest";

import {
  applyToolDone,
  applyToolStart,
  closeRunningTools,
  NAV_UNAVAILABLE_HINT,
  summaryForNavigationDone,
} from "@/domain/orb/chatReduce";
import type { OrbMessage } from "@/types/orb";

const base: OrbMessage = {
  id: "a1",
  role: "assistant",
  content: "",
  tools: [],
  pending: true,
};

describe("chatReduce", () => {
  it("abre tool por id", () => {
    const next = applyToolStart(base, {
      type: "tool",
      phase: "start",
      id: "t1",
      name: "query_tasks",
    });
    expect(next.tools).toEqual([
      { id: "t1", name: "query_tasks", status: "running" },
    ]);
  });

  it("formata navegação disponível no mobile", () => {
    const open = applyToolStart(base, {
      type: "tool",
      phase: "start",
      id: "n1",
      name: "open_screen",
    });
    const done = applyToolDone(open, {
      type: "tool",
      phase: "done",
      id: "n1",
      name: "open_screen",
      ok: true,
      summary: {
        path: "/tasks",
        title: "Tarefas",
        label: "Tarefas",
        screen: "tasks",
        applied: ["status: pending"],
      },
    });
    expect(done.tools?.[0]?.status).toBe("ok");
    expect(String(done.tools?.[0]?.summary)).toContain("Abrindo Tarefas");
  });

  it("avisa quando a rota não existe no app", () => {
    expect(
      summaryForNavigationDone({
        type: "tool",
        phase: "done",
        name: "open_screen",
        ok: true,
        summary: {
          path: "/ops",
          label: "Ops",
          screen: "ops",
          applied: [],
        },
      })
    ).toBe(NAV_UNAVAILABLE_HINT);
  });

  it("encerrar running em error", () => {
    const open = applyToolStart(base, {
      type: "tool",
      phase: "start",
      id: "t1",
      name: "query_tasks",
    });
    expect(closeRunningTools(open).tools?.[0]?.status).toBe("error");
  });
});
