import { describe, expect, it } from "vitest";
import {
  elapsedSeconds,
  formatDuration,
  groupEntriesByDay,
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
  it("formata 0s", () => {
    expect(formatDuration(0)).toBe("00:00");
  });

  it("formata menos de um minuto", () => {
    expect(formatDuration(45)).toBe("00:45");
  });

  it("formata minutos e segundos quando < 1h", () => {
    expect(formatDuration(305)).toBe("05:05");
  });

  it("formata exatamente 1h", () => {
    expect(formatDuration(3600)).toBe("1:00:00");
  });

  it("formata horas, minutos e segundos", () => {
    expect(formatDuration(3661)).toBe("1:01:01");
  });

  it("formata mais de um dia (sem quebrar em dias, só acumula horas)", () => {
    expect(formatDuration(90000)).toBe("25:00:00");
  });
});

describe("groupEntriesByDay", () => {
  it("agrupa entradas pelo dia local de startedAt, dias mais recentes primeiro", () => {
    const entries: TimeEntry[] = [
      { taskId: "a", startedAt: "2026-08-01T10:00:00-03:00", endedAt: "2026-08-01T10:05:00-03:00" },
      { taskId: "b", startedAt: "2026-08-02T09:00:00-03:00", endedAt: "2026-08-02T09:10:00-03:00" },
      { taskId: "a", startedAt: "2026-08-01T14:00:00-03:00", endedAt: "2026-08-01T14:01:00-03:00" },
    ];
    const groups = groupEntriesByDay(entries);
    expect(groups.map((g) => g.dayIso)).toEqual(["2026-08-02", "2026-08-01"]);
    expect(groups[1].entries).toHaveLength(2);
  });

  it("usa o dia local, não a data crua UTC", () => {
    // 2026-08-10T23:30 em UTC-3 = 2026-08-11T02:30Z — o dia local é 10, não 11
    const entries: TimeEntry[] = [
      { taskId: "a", startedAt: "2026-08-10T23:30:00-03:00", endedAt: null },
    ];
    const groups = groupEntriesByDay(entries);
    expect(groups.map((g) => g.dayIso)).toEqual(["2026-08-10"]);
  });
});
