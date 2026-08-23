import type { SubtaskDraft, Task, TaskCreateRequest } from "@/types/tasks";
import { getErrorMessage } from "@/lib/errors";

/**
 * Draft vazio pra criar/editar tarefa, unificado a partir das duas versões que existiam
 * (`TaskList.tsx` sem `project_id` fixo, `ProjectDetail.tsx` com `project_id` sempre preenchido
 * pela rota) — feature 042. `projectId` ausente ou `null` cai em `project_id: null` (comportamento
 * antigo de `TaskList.tsx`); passar o id do projeto reproduz o comportamento antigo de
 * `ProjectDetail.tsx`.
 */
export function emptyTask(projectId?: string | null): TaskCreateRequest {
  return {
    project_id: projectId ?? null,
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
    is_quick: false,
    is_medication: false,
    is_consultation: false,
    // Feature 082: toda tarefa nasce no topo empatado da faixa (`0`) — o desempate fica com o
    // comparador da tela (079) até alguém arrastar. O banco também tem `default 0`; semear aqui é
    // o que mantém o rascunho e a linha gravada com o mesmo formato.
    sort_order: 0,
  };
}

/** Contexto injetado pelas telas que chamam `addSubtaskToEditing`/`removeExistingSubtask` — as
 * chamadas de API (`createTask`/`deleteTask`) e os callbacks de sucesso/erro (`load`/`toast`) são
 * responsabilidade de cada call site, mas a lógica em si (payload da subtarefa nova, guard de
 * `subtask.id` ausente, mensagem de erro) era duplicada byte a byte entre `TaskList.tsx` e
 * `ProjectDetail.tsx` e vive só aqui agora. */
export interface SubtaskMutationContext {
  editing: Pick<Task, "id" | "project_id"> | null;
  createTask: (payload: TaskCreateRequest) => Promise<Task>;
  deleteTask: (id: string) => Promise<void>;
  onSuccess: () => void;
  onError: (message: string) => void;
}

/** Cria uma subtarefa para a tarefa em edição (`ctx.editing`) — no-op se não houver tarefa em
 * edição (modo criação usa a lista local de rascunhos no call site, não isso). */
export async function addSubtaskToEditing(ctx: SubtaskMutationContext, title: string): Promise<void> {
  if (!ctx.editing) return;
  try {
    await ctx.createTask({
      ...emptyTask(ctx.editing.project_id),
      parent_task_id: ctx.editing.id,
      title,
    });
    ctx.onSuccess();
  } catch (error) {
    ctx.onError(getErrorMessage(error, "Não foi possível adicionar a subtarefa."));
  }
}

/** Remove uma subtarefa já existente — no-op se `subtask.id` ainda não existir (rascunho não
 * salvo, tratado localmente no call site). */
export async function removeExistingSubtask(
  ctx: SubtaskMutationContext,
  subtask: SubtaskDraft
): Promise<void> {
  if (!subtask.id) return;
  try {
    await ctx.deleteTask(subtask.id);
    ctx.onSuccess();
  } catch (error) {
    ctx.onError(getErrorMessage(error, "Não foi possível remover a subtarefa."));
  }
}
