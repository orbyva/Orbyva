import { describe, expect, it } from "vitest";
import {
  buildProjectEventPayload,
  emptyProjectEventDraft,
  isProjectEventDraftValid,
  projectEventToDraft,
  validateProjectEventDraft,
  type ProjectEventDraft,
} from "@/domain/tasks/projectEvent";

/**
 * Feature 103 — a regra compartilhada por criar/editar evento (e pelo arrasto da 104).
 *
 * O caso que mais importa aqui é o do fuso: `starts_at` é montado em **hora local** e gravado em
 * ISO. Mandar a string do `<input type="datetime-local">` direto para o banco a gravaria como UTC e
 * deslocaria o evento — em UTC-3 um "dentista às 15h" viraria meio-dia na grade. Por isso as
 * asserções abaixo comparam com um `new Date(y, m, d, h, min)` local, e não com uma string ISO
 * fixa: a suíte roda em qualquer fuso.
 */

function draft(overrides: Partial<ProjectEventDraft> = {}): ProjectEventDraft {
  return emptyProjectEventDraft({
    title: "Reunião",
    date: "2026-09-02",
    startTime: "15:00",
    ...overrides,
  });
}

describe("buildProjectEventPayload (feature 103)", () => {
  it("monta starts_at em hora local, não como UTC", () => {
    const payload = buildProjectEventPayload(draft());

    expect(payload.starts_at).toBe(new Date(2026, 8, 2, 15, 0, 0, 0).toISOString());
    // O inverso: reler o ISO devolve 15h no relógio do usuário.
    const back = new Date(payload.starts_at);
    expect(back.getHours()).toBe(15);
    expect(back.getMinutes()).toBe(0);
    expect(back.getDate()).toBe(2);
  });

  it("sem hora de fim, ends_at é null (a grade cai nos 30 min padrão)", () => {
    expect(buildProjectEventPayload(draft()).ends_at).toBeNull();
    expect(buildProjectEventPayload(draft({ endTime: "" })).ends_at).toBeNull();
  });

  it("com hora de fim, ends_at também sai em hora local", () => {
    const payload = buildProjectEventPayload(draft({ endTime: "16:30" }));

    expect(payload.ends_at).toBe(new Date(2026, 8, 2, 16, 30, 0, 0).toISOString());
  });

  it("sem projeto, project_id é null — evento sem projeto é permitido", () => {
    expect(buildProjectEventPayload(draft()).project_id).toBeNull();
  });

  it("com projeto, project_id vai no payload", () => {
    expect(buildProjectEventPayload(draft({ projectId: "p-1" })).project_id).toBe("p-1");
  });

  it("título vai sem espaços das pontas", () => {
    expect(buildProjectEventPayload(draft({ title: "  Dentista  " })).title).toBe("Dentista");
  });

  it("rascunho sem data lança — chegar aqui inválido é bug de wiring, não entrada do usuário", () => {
    expect(() => buildProjectEventPayload(draft({ date: "" }))).toThrow(/inválido/i);
  });
});

describe("validateProjectEventDraft (feature 103)", () => {
  it("rascunho completo não tem erro nenhum", () => {
    expect(validateProjectEventDraft(draft({ endTime: "16:00" }))).toEqual({});
    expect(isProjectEventDraftValid(draft({ endTime: "16:00" }))).toBe(true);
  });

  it("título só com espaços acusa erro no campo título", () => {
    const errors = validateProjectEventDraft(draft({ title: "   " }));

    expect(errors.title).toBeTruthy();
    expect(isProjectEventDraftValid(draft({ title: "   " }))).toBe(false);
  });

  it("data ausente acusa erro no campo data", () => {
    expect(validateProjectEventDraft(draft({ date: "" })).date).toBeTruthy();
  });

  it("hora de início ausente acusa erro no campo de início", () => {
    expect(validateProjectEventDraft(draft({ startTime: "" })).startTime).toBeTruthy();
  });

  it("fim antes do início acusa erro no campo de fim", () => {
    expect(validateProjectEventDraft(draft({ endTime: "14:00" })).endTime).toBeTruthy();
  });

  it("fim igual ao início também é erro — evento de duração zero é engano de digitação", () => {
    expect(validateProjectEventDraft(draft({ endTime: "15:00" })).endTime).toBeTruthy();
  });

  it("fim vazio não é erro — a hora de fim é opcional", () => {
    expect(validateProjectEventDraft(draft({ endTime: "" })).endTime).toBeUndefined();
  });
});

describe("projectEventToDraft (feature 103)", () => {
  it("é o inverso de buildProjectEventPayload — ida e volta preserva data/hora locais", () => {
    const original = draft({ endTime: "16:30", projectId: "p-1" });

    const roundTrip = projectEventToDraft({
      ...buildProjectEventPayload(original),
      title: original.title,
    });

    expect(roundTrip).toEqual(original);
  });

  it("evento sem ends_at volta com endTime vazio", () => {
    const back = projectEventToDraft({
      project_id: null,
      title: "Dentista",
      starts_at: new Date(2026, 8, 2, 9, 5).toISOString(),
      ends_at: null,
    });

    expect(back).toEqual({
      title: "Dentista",
      date: "2026-09-02",
      startTime: "09:05",
      endTime: "",
      projectId: null,
    });
  });
});

describe("emptyProjectEventDraft (feature 103)", () => {
  it("sem overrides vem tudo vazio e sem projeto", () => {
    expect(emptyProjectEventDraft()).toEqual({
      title: "",
      date: "",
      startTime: "",
      endTime: "",
      projectId: null,
    });
  });

  it("aceita a data do dia clicado — é o que o `+` da célula vai passar", () => {
    expect(emptyProjectEventDraft({ date: "2026-09-10" }).date).toBe("2026-09-10");
  });
});
