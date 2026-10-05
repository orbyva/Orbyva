import { describe, expect, it } from "vitest";

import { computeImmediateSchedule, describeStartNow } from "@/domain/tasks/immediate";
import { describeOccurrences, emptyAttendanceMessage } from "@/domain/tasks/occurrences";
import {
  buildTimeEntryUpdate,
  entryDurationMinutes,
  joinLocalDateTime,
  splitLocalDateTime,
} from "@/domain/tasks/timeEntryEdit";
import type { Task } from "@/types/tasks";

const NOW = new Date(2026, 9, 5, 14, 10);

describe("computeImmediateSchedule", () => {
  it("soma a duração estimada", () => {
    expect(computeImmediateSchedule({ estimated_duration: 60 }, NOW)).toEqual({
      due_date: "2026-10-05",
      due_time: "15:10",
      usedFallbackMinutes: null,
      minutes: 60,
    });
  });

  it("pontual = agora exato, mesmo com duração", () => {
    const s = computeImmediateSchedule({ estimated_duration: 90, is_quick: true }, NOW);
    expect(s).toMatchObject({ due_time: "14:10", minutes: 0, usedFallbackMinutes: null });
  });

  it("sem duração usa o padrão de 30 min e sinaliza", () => {
    const s = computeImmediateSchedule({ estimated_duration: null }, NOW);
    expect(s).toMatchObject({ due_time: "14:40", usedFallbackMinutes: 30 });
  });

  it("vira o dia quando atravessa a meia-noite", () => {
    const s = computeImmediateSchedule({ estimated_duration: 30 }, new Date(2026, 9, 5, 23, 50));
    expect(s).toMatchObject({ due_date: "2026-10-06", due_time: "00:20" });
  });
});

describe("describeStartNow", () => {
  it("hoje mostra só a hora e lista os avisos", () => {
    const schedule = computeImmediateSchedule({}, NOW);
    expect(
      describeStartNow({
        schedule,
        now: NOW,
        stoppedPrevious: true,
        previousDue: { due_date: "2026-10-04", due_time: "09:00" },
      })
    ).toBe(
      "Começou agora · prazo 14:40. Sem duração estimada — usamos 30 min. O timer anterior foi parado. Prazo anterior: 04/10/2026 09:00."
    );
  });

  it("outro dia inclui a data", () => {
    const schedule = computeImmediateSchedule({ estimated_duration: 30 }, new Date(2026, 9, 5, 23, 50));
    expect(describeStartNow({ schedule, now: new Date(2026, 9, 5, 23, 50) })).toBe(
      "Começou agora · prazo 06/10/2026 00:20."
    );
  });
});

describe("edição de registro de tempo", () => {
  it("split/join é ida e volta no fuso local", () => {
    const iso = joinLocalDateTime({ date: "2026-10-05", time: "08:30" });
    expect(splitLocalDateTime(iso)).toEqual({ date: "2026-10-05", time: "08:30" });
  });

  it("recusa fim antes do início", () => {
    const r = buildTimeEntryUpdate(
      { date: "2026-10-05", time: "10:00" },
      { date: "2026-10-05", time: "09:00" }
    );
    expect(r).toEqual({ ok: false, error: "O fim precisa ser depois do início." });
  });

  it("fim nulo mantém em andamento; fim no dia seguinte é aceito", () => {
    const running = buildTimeEntryUpdate({ date: "2026-10-05", time: "10:00" }, null);
    expect(running.ok && running.value.ended_at).toBeNull();
    const overnight = buildTimeEntryUpdate(
      { date: "2026-10-05", time: "23:00" },
      { date: "2026-10-06", time: "01:00" }
    );
    expect(overnight.ok).toBe(true);
    if (overnight.ok) {
      expect(entryDurationMinutes(overnight.value.started_at, overnight.value.ended_at)).toBe(120);
    }
  });
});

describe("ocorrências da série", () => {
  const t = (over: Partial<Task>): Task =>
    ({
      id: "x",
      title: "Remédio",
      status: "todo",
      due_date: "2026-10-05",
      due_time: "08:00",
      parent_task_id: null,
      project_id: null,
      recurrence_rule: null,
      recurrence_origin_id: null,
      linked_recurring_id: null,
      ...over,
    }) as Task;

  it("série comum mostra prazo e status", () => {
    const rows = describeOccurrences(t({}), [t({ id: "a" }), t({ id: "b", due_date: null })]);
    expect(rows).toEqual([
      { id: "a", label: "05/10/2026 08:00", statusLabel: "A fazer", late: false },
      { id: "b", label: "Sem prazo", statusLabel: "A fazer", late: false },
    ]);
  });

  it("medicação concluída mostra 'Tomado às' e marca atraso", () => {
    const origin = t({ is_medication: true });
    const takenLate = t({
      id: "a",
      status: "done",
      completed_at: new Date(2026, 9, 5, 10, 15).toISOString(),
    });
    const [row] = describeOccurrences(origin, [takenLate]);
    expect(row.label).toBe("Tomado às 10:15 · 05/10/2026");
    expect(row.late).toBe(true);
    expect(row.statusLabel).toBe("Feito");
  });

  it("consulta usa 'Compareceu às' e nunca marca atraso", () => {
    const origin = t({ is_consultation: true });
    const [row] = describeOccurrences(origin, [
      t({ id: "a", status: "done", completed_at: new Date(2026, 9, 5, 11, 0).toISOString() }),
    ]);
    expect(row.label.startsWith("Compareceu às 11:00")).toBe(true);
    expect(row.late).toBe(false);
  });

  it("aviso de nada registrado só para medicação/consulta sem nenhuma concluída", () => {
    expect(emptyAttendanceMessage(t({ is_medication: true }), [t({})])).toBe(
      "Nenhuma dose registrada ainda."
    );
    expect(emptyAttendanceMessage(t({ is_consultation: true }), [t({})])).toBe(
      "Nenhuma consulta registrada ainda."
    );
    expect(emptyAttendanceMessage(t({}), [t({})])).toBeNull();
    expect(emptyAttendanceMessage(t({ is_medication: true }), [t({ status: "done" })])).toBeNull();
  });
});
