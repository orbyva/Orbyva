import { Calendar } from "lucide-react";
import type { ReactNode } from "react";
import type { Project, Task, TaskPriority } from "@/types/tasks";
import { formatDateTimeBR } from "@/lib/currency";
import { TaskPriorityFlag } from "./TaskPriorityField";
import { TaskPriorityQuickPick } from "./TaskPriorityQuickPick";
import { TaskDueQuickEdit } from "./TaskDueQuickEdit";
import { ProjectBadgeButton } from "./ProjectBadgeButton";
import { TaskIconBadge } from "./TaskIconBadge";
import { TaskIconPicker, type TaskIconValue } from "./TaskIconPicker";

export interface TaskQuickFieldsResult {
  /** Ícone customizado da tarefa — `TaskIconPicker` (clicável) quando `onIconChange` é passado,
   * senão `TaskIconBadge` (somente-leitura, nada quando a tarefa não tem ícone) (feature 035). */
  icon: ReactNode;
  /** Ícone de prioridade — `TaskPriorityQuickPick` (clicável) quando `onPriorityChange` é
   * passado, senão `TaskPriorityFlag` (somente-leitura, `null` some sem prioridade). */
  priority: ReactNode;
  /** Prazo — "Concluída em..." pra tarefas feitas (somente-leitura mesmo com `onDueChange`,
   * já não faz sentido reagendar algo concluído), `TaskDueQuickEdit` (clicável, com ícone
   * `Calendar`) quando `onDueChange` é passado, senão texto estático com o mesmo ícone. */
  due: ReactNode;
  /** Badge de projeto — `ProjectBadgeButton` (clicável) quando `onProjectChange` + `projects`
   * são passados, senão o `projectBadge` estático recebido (compatibilidade com quem monta o
   * badge por fora). */
  project: ReactNode;
}

/**
 * Lógica compartilhada de edição rápida inline (prioridade/prazo/projeto) — extraída de
 * `TaskListRow` (feature 029) pra ser reaproveitada também pelo `KanbanCard` (feature 033), sem
 * duplicar a mesma árvore condicional em dois lugares. Cada campo é editável quando o handler
 * correspondente é passado, e cai pro visual somente-leitura de sempre quando ausente — mesma
 * regra "ausência = sem regressão" que `TaskListRow` já seguia.
 *
 * Não é um componente JSX (não renderiza um wrapper) — devolve os três elementos prontos pra
 * quem chama posicionar cada um no seu próprio layout (a Lista mostra prioridade junto do título
 * e prazo/projeto na linha de metadados; o Kanban segue o mesmo arranjo, mas em outro container).
 */
export function TaskQuickFields({
  task,
  onIconChange,
  onPriorityChange,
  onDueChange,
  onProjectChange,
  projects,
  projectBadge,
}: {
  task: Task;
  /** Presente = edição rápida de ícone inline (popover com `TaskIconPicker`), no lugar do
   * `TaskIconBadge` estático (feature 035). */
  onIconChange?: (next: TaskIconValue) => void;
  onPriorityChange?: (priority: TaskPriority | null) => void;
  onDueChange?: (next: {
    due_date: string | null;
    due_time: string | null;
    estimated_duration: number | null;
  }) => void;
  onProjectChange?: (projectId: string | null) => void;
  /** Catálogo de projetos (já ordenado por atividade) — obrigatório junto com `onProjectChange`. */
  projects?: Project[];
  /** Badge do projeto somente-leitura — usado quando `onProjectChange`/`projects` não são
   * passados. */
  projectBadge?: ReactNode;
}): TaskQuickFieldsResult {
  const done = task.status === "done";
  return {
    icon: onIconChange ? (
      <TaskIconPicker
        taskId={task.id}
        value={{ icon_key: task.icon_key ?? null, icon_url: task.icon_url ?? null }}
        onChange={onIconChange}
      />
    ) : (
      <TaskIconBadge iconKey={task.icon_key} iconUrl={task.icon_url} />
    ),
    priority: onPriorityChange ? (
      <TaskPriorityQuickPick value={task.priority} onChange={onPriorityChange} />
    ) : (
      <TaskPriorityFlag priority={task.priority} />
    ),
    due:
      done && task.completed_at ? (
        <span>Concluída em {formatDateTimeBR(task.completed_at)}</span>
      ) : onDueChange ? (
        <TaskDueQuickEdit
          dueDate={task.due_date}
          dueTime={task.due_time}
          estimatedDuration={task.estimated_duration}
          onChange={onDueChange}
        />
      ) : (
        task.due_date && (
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {formatDateTimeBR(task.due_date, task.due_time)}
          </span>
        )
      ),
    project:
      onProjectChange && projects ? (
        <ProjectBadgeButton projects={projects} value={task.project_id} onChange={onProjectChange} />
      ) : (
        projectBadge
      ),
  };
}
