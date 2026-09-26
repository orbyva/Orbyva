import { describe, expect, it } from "vitest";
import {
  partitionConsultationHistory,
  selectDashboardConsultations,
  selectDashboardDoses,
} from "@/domain/health/dashboard";
import type { Task } from "@/types/tasks";

const TODAY = "2026-08-16";

function task(overrides: Partial<Task>): Task {
  return {
    id: "t",
    project_id: null,
    parent_task_id: null,
    recurrence_origin_id: null,
    title: "Item",
    status: "todo",
    tag_ids: [],
    due_date: TODAY,
    due_time: "08:00",
    recurrence_rule: null,
    linked_recurring_id: null,
    linked_installment_number: null,
    ...overrides,
  };
}

describe("selectDashboardDoses", () => {
  it("lista as doses de hoje, tomadas e pendentes, na ordem do horário", () => {
    const taken = task({
      id: "manha",
      title: "Losartana",
      due_time: "08:00",
      status: "done",
    });
    const pending = task({
      id: "noite",
      title: "Vitamina D",
      due_time: "20:00",
    });
    const later = task({
      id: "futura",
      due_date: "2026-08-18",
      due_time: "08:00",
    });

    expect(selectDashboardDoses([later, pending, taken], TODAY).map((d) => d.id)).toEqual([
      "manha",
      "noite",
    ]);
  });

  it("traz dose atrasada ainda pendente, e esconde a atrasada já tomada", () => {
    const overdue = task({
      id: "ontem-pendente",
      due_date: "2026-08-15",
      status: "todo",
    });
    const overdueTaken = task({
      id: "ontem-tomada",
      due_date: "2026-08-15",
      status: "done",
    });

    expect(
      selectDashboardDoses([overdueTaken, overdue], TODAY).map((d) => d.id)
    ).toEqual(["ontem-pendente"]);
  });

  it("dose sem horário no mesmo dia vai para o fim", () => {
    const semHora = task({ id: "sem-hora", due_time: null });
    const manha = task({ id: "manha", due_time: "07:30" });

    expect(selectDashboardDoses([semHora, manha], TODAY).map((d) => d.id)).toEqual([
      "manha",
      "sem-hora",
    ]);
  });
});

describe("selectDashboardConsultations", () => {
  it("lista as próximas pendentes, a mais cedo primeiro", () => {
    const later = task({
      id: "c2",
      is_consultation: true,
      due_date: "2026-10-02",
      due_time: "09:00",
    });
    const sooner = task({
      id: "c1",
      is_consultation: true,
      due_date: "2026-09-10",
      due_time: "14:30",
    });

    expect(
      selectDashboardConsultations([later, sooner], TODAY).map((c) => c.id)
    ).toEqual(["c1", "c2"]);
  });

  it("mantém consulta de hoje já comparecida e esconde comparecida de outro dia", () => {
    const todayDone = task({
      id: "hoje",
      is_consultation: true,
      status: "done",
      due_date: TODAY,
    });
    const futureDone = task({
      id: "outra",
      is_consultation: true,
      status: "done",
      due_date: "2026-08-20",
    });
    const upcoming = task({
      id: "proxima",
      is_consultation: true,
      due_date: "2026-08-25",
    });

    expect(
      selectDashboardConsultations([futureDone, upcoming, todayDone], TODAY).map(
        (c) => c.id
      )
    ).toEqual(["hoje", "proxima"]);
  });
});

describe("partitionConsultationHistory", () => {
  it("separa pendentes na ordem da agenda e comparecidas da mais nova para a mais antiga", () => {
    const overdue = task({
      id: "atrasada",
      is_consultation: true,
      due_date: "2026-08-01",
    });
    const next = task({
      id: "proxima",
      is_consultation: true,
      due_date: "2026-09-10",
      due_time: "14:30",
    });
    const oldDone = task({
      id: "antiga",
      is_consultation: true,
      status: "done",
      due_date: "2026-07-02",
    });
    const recentDone = task({
      id: "recente",
      is_consultation: true,
      status: "done",
      due_date: "2026-08-10",
    });

    const { upcoming, history } = partitionConsultationHistory([
      recentDone,
      next,
      oldDone,
      overdue,
    ]);

    expect(upcoming.map((row) => row.id)).toEqual(["atrasada", "proxima"]);
    expect(history.map((row) => row.id)).toEqual(["recente", "antiga"]);
  });
});
