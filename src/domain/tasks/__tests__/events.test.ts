import { describe, expect, it } from "vitest";
import {
  eventLinkKind,
  isEventLinkValid,
  resolveEventProjectId,
  validateEventDraft,
  type EventLinkTaskLike,
} from "@/domain/tasks/events";

const taskById = new Map<string, EventLinkTaskLike>([
  ["task-com-projeto", { project_id: "proj-1" }],
  ["task-solta", { project_id: null }],
]);

describe("eventLinkKind", () => {
  it("evento de projeto", () => {
    expect(eventLinkKind({ project_id: "proj-1", task_id: null })).toBe("project");
  });

  it("evento de tarefa", () => {
    expect(eventLinkKind({ project_id: null, task_id: "task-1" })).toBe("task");
  });

  it("evento avulso", () => {
    expect(eventLinkKind({ project_id: null, task_id: null })).toBe("none");
  });

  it("campos ausentes contam como avulso (linha vinda sem as colunas)", () => {
    expect(eventLinkKind({})).toBe("none");
  });
});

describe("resolveEventProjectId", () => {
  it("evento de projeto devolve o próprio project_id", () => {
    expect(
      resolveEventProjectId({ project_id: "proj-9", task_id: null }, taskById)
    ).toBe("proj-9");
  });

  it("evento de tarefa deriva o projeto da tarefa", () => {
    expect(
      resolveEventProjectId({ project_id: null, task_id: "task-com-projeto" }, taskById)
    ).toBe("proj-1");
  });

  it("evento de tarefa sem projeto (tarefa solta) resolve para null", () => {
    expect(
      resolveEventProjectId({ project_id: null, task_id: "task-solta" }, taskById)
    ).toBeNull();
  });

  it("tarefa fora do mapa resolve para null sem lançar", () => {
    expect(
      resolveEventProjectId({ project_id: null, task_id: "task-fantasma" }, taskById)
    ).toBeNull();
  });

  it("evento avulso resolve para null", () => {
    expect(resolveEventProjectId({ project_id: null, task_id: null }, taskById)).toBeNull();
  });

  it("nunca copia o projeto: mudar a tarefa de projeto muda o resultado na hora", () => {
    const evento = { project_id: null, task_id: "task-com-projeto" };
    expect(resolveEventProjectId(evento, taskById)).toBe("proj-1");

    const depoisDaMudanca = new Map<string, EventLinkTaskLike>([
      ["task-com-projeto", { project_id: "proj-2" }],
    ]);
    expect(resolveEventProjectId(evento, depoisDaMudanca)).toBe("proj-2");
  });
});

describe("isEventLinkValid", () => {
  it("aceita os três estados válidos", () => {
    expect(isEventLinkValid({ project_id: "proj-1", task_id: null })).toBe(true);
    expect(isEventLinkValid({ project_id: null, task_id: "task-1" })).toBe(true);
    expect(isEventLinkValid({ project_id: null, task_id: null })).toBe(true);
  });

  it("recusa o par preenchido, igual à check constraint project_event_single_link", () => {
    expect(isEventLinkValid({ project_id: "proj-1", task_id: "task-1" })).toBe(false);
  });
});

describe("validateEventDraft (feature 067)", () => {
  const startsAt = new Date(2026, 7, 17, 9, 0).toISOString();

  it("título vazio reprova com reason 'title'", () => {
    expect(validateEventDraft({ title: "", startsAt })).toEqual({ ok: false, reason: "title" });
  });

  it("título só com espaços reprova com reason 'title'", () => {
    expect(validateEventDraft({ title: "   ", startsAt })).toEqual({ ok: false, reason: "title" });
  });

  it("início ausente reprova com reason 'starts'", () => {
    expect(validateEventDraft({ title: "Reunião", startsAt: "" })).toEqual({
      ok: false,
      reason: "starts",
    });
  });

  it("início inválido reprova com reason 'starts'", () => {
    expect(validateEventDraft({ title: "Reunião", startsAt: "não é data" })).toEqual({
      ok: false,
      reason: "starts",
    });
  });

  it("fim anterior ao início reprova com reason 'ends'", () => {
    expect(
      validateEventDraft({
        title: "Reunião",
        startsAt,
        endsAt: new Date(2026, 7, 17, 8, 0).toISOString(),
      })
    ).toEqual({ ok: false, reason: "ends" });
  });

  it("fim igual ao início reprova com reason 'ends' (a check exige ends_at > starts_at)", () => {
    expect(validateEventDraft({ title: "Reunião", startsAt, endsAt: startsAt })).toEqual({
      ok: false,
      reason: "ends",
    });
  });

  it("fim vazio ou nulo é válido — evento sem hora de término é o caso comum", () => {
    expect(validateEventDraft({ title: "Reunião", startsAt, endsAt: "" })).toEqual({ ok: true });
    expect(validateEventDraft({ title: "Reunião", startsAt, endsAt: null })).toEqual({ ok: true });
    expect(validateEventDraft({ title: "Reunião", startsAt })).toEqual({ ok: true });
  });

  it("tudo preenchido e coerente é válido", () => {
    expect(
      validateEventDraft({
        title: "Reunião",
        startsAt,
        endsAt: new Date(2026, 7, 17, 10, 0).toISOString(),
      })
    ).toEqual({ ok: true });
  });
});
