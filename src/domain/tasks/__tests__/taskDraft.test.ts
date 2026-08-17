import { describe, expect, it, vi } from "vitest";
import {
  addSubtaskToEditing,
  emptyTask,
  removeExistingSubtask,
  type SubtaskMutationContext,
} from "@/domain/tasks/taskDraft";
import type { Task, TaskCreateRequest } from "@/types/tasks";

/**
 * Feature 042 — unificação do form de edição de tarefa entre `TaskList.tsx` e `ProjectDetail.tsx`.
 * `emptyTask`/`addSubtaskToEditing`/`removeExistingSubtask` eram implementados byte a byte iguais
 * nos dois arquivos; aqui cobrimos a versão única em `taskDraft.ts`.
 */

describe("emptyTask", () => {
  it("sem projectId, cai em project_id: null (comportamento antigo de TaskList.tsx)", () => {
    const draft = emptyTask();
    expect(draft.project_id).toBeNull();
  });

  it("com projectId null explícito, mantém project_id: null", () => {
    expect(emptyTask(null).project_id).toBeNull();
  });

  it("com projectId, preenche project_id (comportamento antigo de ProjectDetail.tsx)", () => {
    const draft = emptyTask("project-1");
    expect(draft.project_id).toBe("project-1");
  });

  it("demais campos vêm com os defaults esperados por um formulário em branco", () => {
    const draft = emptyTask();
    expect(draft).toMatchObject({
      parent_task_id: null,
      title: "",
      description: "",
      status: "todo",
      tag_ids: [],
      due_date: null,
      due_time: null,
      start_date: null,
      priority: null,
      recurrence_rule: null,
      linked_recurring_id: null,
      external_url: null,
      external_provider: null,
      icon_key: null,
      icon_url: null,
      is_milestone: false,
      is_medication: false,
    });
  });
});

function makeContext(overrides: Partial<SubtaskMutationContext> = {}): SubtaskMutationContext {
  return {
    editing: { id: "parent-1", project_id: "project-1" },
    createTask: vi.fn().mockResolvedValue({ id: "new-task" } as Task),
    deleteTask: vi.fn().mockResolvedValue(undefined),
    onSuccess: vi.fn(),
    onError: vi.fn(),
    ...overrides,
  };
}

describe("addSubtaskToEditing", () => {
  it("sem tarefa em edição, não chama createTask (modo criação usa a lista local no call site)", async () => {
    const ctx = makeContext({ editing: null });
    await addSubtaskToEditing(ctx, "Nova subtarefa");
    expect(ctx.createTask).not.toHaveBeenCalled();
    expect(ctx.onSuccess).not.toHaveBeenCalled();
  });

  it("com tarefa em edição, cria a subtarefa herdando project_id e usando o id como parent_task_id", async () => {
    const ctx = makeContext();
    await addSubtaskToEditing(ctx, "Nova subtarefa");
    expect(ctx.createTask).toHaveBeenCalledWith(
      expect.objectContaining<Partial<TaskCreateRequest>>({
        project_id: "project-1",
        parent_task_id: "parent-1",
        title: "Nova subtarefa",
      })
    );
    expect(ctx.onSuccess).toHaveBeenCalledTimes(1);
    expect(ctx.onError).not.toHaveBeenCalled();
  });

  it("se createTask falhar, chama onError com a mensagem de fallback e não chama onSuccess", async () => {
    const ctx = makeContext({ createTask: vi.fn().mockRejectedValue(new Error()) });
    await addSubtaskToEditing(ctx, "Nova subtarefa");
    expect(ctx.onError).toHaveBeenCalledWith("Não foi possível adicionar a subtarefa.");
    expect(ctx.onSuccess).not.toHaveBeenCalled();
  });
});

describe("removeExistingSubtask", () => {
  it("subtarefa ainda sem id (rascunho não salvo) é no-op — não chama deleteTask", async () => {
    const ctx = makeContext();
    await removeExistingSubtask(ctx, { title: "Rascunho" });
    expect(ctx.deleteTask).not.toHaveBeenCalled();
    expect(ctx.onSuccess).not.toHaveBeenCalled();
  });

  it("subtarefa com id chama deleteTask e onSuccess", async () => {
    const ctx = makeContext();
    await removeExistingSubtask(ctx, { id: "sub-1", title: "Existente" });
    expect(ctx.deleteTask).toHaveBeenCalledWith("sub-1");
    expect(ctx.onSuccess).toHaveBeenCalledTimes(1);
  });

  it("se deleteTask falhar, chama onError com a mensagem de fallback", async () => {
    const ctx = makeContext({ deleteTask: vi.fn().mockRejectedValue(new Error()) });
    await removeExistingSubtask(ctx, { id: "sub-1", title: "Existente" });
    expect(ctx.onError).toHaveBeenCalledWith("Não foi possível remover a subtarefa.");
    expect(ctx.onSuccess).not.toHaveBeenCalled();
  });
});
