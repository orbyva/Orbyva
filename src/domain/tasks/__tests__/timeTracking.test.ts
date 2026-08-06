import { describe, expect, it } from "vitest";
import {
  elapsedSeconds,
  formatDuration,
  totalSecondsForTask,
  type TimeEntry,
} from "@/domain/tasks/timeTracking";

describe("elapsedSeconds", () => {
  it("calcula duração de entrada finalizada", () => {
    const entry: TimeEntry = {
      taskId: "a",
      startedAt: "2026-08-01T10:00:00.000Z",
      endedAt: "2026-08-01T10:05:00.000Z",
    };
    expect(elapsedSeconds(entry)).toBe(300);
  });

  it("usa `now` para entrada em andamento", () => {
    const entry: TimeEntry = {
      taskId: "a",
      startedAt: "2026-08-01T10:00:00.000Z",
      endedAt: null,
    };
    const now = new Date("2026-08-01T10:02:00.000Z");
    expect(elapsedSeconds(entry, now)).toBe(120);
  });
});

describe("totalSecondsForTask", () => {
  it("soma só as entradas da tarefa pedida", () => {
    const entries: TimeEntry[] = [
      {
        taskId: "a",
        startedAt: "2026-08-01T10:00:00.000Z",
        endedAt: "2026-08-01T10:05:00.000Z",
      },
      {
        taskId: "b",
        startedAt: "2026-08-01T10:00:00.000Z",
        endedAt: "2026-08-01T10:10:00.000Z",
      },
      {
        taskId: "a",
        startedAt: "2026-08-01T11:00:00.000Z",
        endedAt: "2026-08-01T11:01:00.000Z",
      },
    ];
    expect(totalSecondsForTask("a", entries)).toBe(360);
  });
});

describe("formatDuration", () => {
  it("formata minutos quando < 1h", () => {
    expect(formatDuration(300)).toBe("5min");
  });

  it("formata horas e minutos", () => {
    expect(formatDuration(3660)).toBe("1h01");
  });
});
