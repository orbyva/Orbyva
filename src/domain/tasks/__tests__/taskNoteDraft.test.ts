import { describe, expect, it } from "vitest";
import {
  buildTaskNoteDraft,
  buildTaskNoteLinkDraft,
  type TaskNoteSource,
} from "@/domain/tasks/taskNoteDraft";
import {
  NOTE_TITLE_MAX,
  UNTITLED_NOTE_TITLE,
  normalizeNoteDraft,
} from "@/domain/notes/noteDraft";

/**
 * Feature 084 — o caminho de ida tarefa → nota/canvas. O que se cobre aqui é só o rascunho: de
 * onde vem o `project_id` ("o projeto já preenchido" do pedido), o par `kind`/`canvas_data`, e o
 * fato de o título passar cru para `normalizeNoteDraft` decidir corte e vazio (nada é duplicado).
 */

function makeTask(overrides: Partial<TaskNoteSource> = {}): TaskNoteSource {
  return {
    id: "task-1",
    title: "Escrever a pauta da reunião",
    project_id: "project-1",
    ...overrides,
  };
}

describe("buildTaskNoteDraft", () => {
  it("nota de tarefa com projeto herda o project_id da tarefa", () => {
    expect(buildTaskNoteDraft(makeTask()).project_id).toBe("project-1");
  });

  it("tarefa sem projeto vira nota solta (project_id null)", () => {
    expect(buildTaskNoteDraft(makeTask({ project_id: null })).project_id).toBeNull();
  });

  it("nota nasce com o título da tarefa e conteúdo vazio", () => {
    expect(buildTaskNoteDraft(makeTask())).toMatchObject({
      title: "Escrever a pauta da reunião",
      content: "",
    });
  });

  it("sem kind explícito, é nota markdown", () => {
    expect(buildTaskNoteDraft(makeTask()).kind).toBe("markdown");
  });

  it("canvas sai com kind canvas e a cena vazia", () => {
    const draft = buildTaskNoteDraft(makeTask(), "canvas");
    expect(draft.kind).toBe("canvas");
    expect(draft.canvas_data).toEqual({ elements: [] });
  });

  it("nota markdown sai com canvas_data nulo — desenho em nota de texto seria dado órfão", () => {
    expect(buildTaskNoteDraft(makeTask(), "markdown").canvas_data).toBeNull();
  });

  it("título longo demais é cortado por normalizeNoteDraft, sem estourar o limite", () => {
    const longTitle = "a".repeat(NOTE_TITLE_MAX + 40);
    const draft = buildTaskNoteDraft(makeTask({ title: longTitle }));
    // O builder não corta: quem corta é a normalização, no caminho do insert.
    expect(draft.title).toHaveLength(NOTE_TITLE_MAX + 40);
    expect(normalizeNoteDraft(draft).title).toHaveLength(NOTE_TITLE_MAX);
  });

  it("título vazio (só espaço) cai em 'Sem título' depois de normalizar", () => {
    const draft = buildTaskNoteDraft(makeTask({ title: "   " }));
    expect(normalizeNoteDraft(draft).title).toBe(UNTITLED_NOTE_TITLE);
  });

  it("normalizar um canvas preserva o par kind/canvas_data", () => {
    const normalized = normalizeNoteDraft(buildTaskNoteDraft(makeTask(), "canvas"));
    expect(normalized.kind).toBe("canvas");
    expect(normalized.canvas_data).toEqual({ elements: [] });
  });
});

describe("buildTaskNoteLinkDraft", () => {
  it("vincula a nota à tarefa com entity_type 'task' e o id da tarefa", () => {
    expect(buildTaskNoteLinkDraft("note-9", makeTask())).toEqual({
      note_id: "note-9",
      entity_type: "task",
      entity_id: "task-1",
      label: "Escrever a pauta da reunião",
    });
  });

  it("congela o título da tarefa no label (regra da 056)", () => {
    const task = makeTask({ title: "Comprar tinta" });
    const link = buildTaskNoteLinkDraft("note-9", task);
    task.title = "Comprar tinta e pincel";
    expect(link.label).toBe("Comprar tinta");
  });
});
