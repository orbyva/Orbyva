import type { Dispatch, SetStateAction } from "react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FormLabel, FORM_FIELDS_CLASS } from "@/components/FormLabel";
import { cn } from "@/lib/utils";
import { detectExternalProvider } from "@/domain/tasks";
import { TaskDescriptionField } from "./TaskDescriptionField";
import { TaskIconPicker } from "./TaskIconPicker";
import { TaskPriorityField } from "./TaskPriorityField";
import { TaskMilestoneField } from "./TaskMilestoneField";
import { TaskRecurrenceField } from "./TaskRecurrenceField";
import { TagCombobox } from "./TagCombobox";
import { ProjectPicker } from "./ProjectPicker";
import { TaskSubtasksField } from "./TaskSubtasksField";
import { TaskTimeEntriesField } from "./TaskTimeEntriesField";
import type { Project, SubtaskDraft, Tag, Task, TaskCreateRequest } from "@/types/tasks";
import type { Recurring } from "@/types/recurring";
import type { Dimension } from "@/types/dimensions";

/**
 * Abas do form de tarefa (Geral/Data e repetição/Organização/Registros) — antes declarado
 * separadamente em `TaskList.tsx:136` e `ProjectDetail.tsx:127`, agora só aqui (feature 042).
 */
export type TaskFormTab = "geral" | "data" | "organizacao" | "registros";

export interface TaskFormFieldsProps {
  formTab: TaskFormTab;
  onFormTabChange: (tab: TaskFormTab) => void;
  form: TaskCreateRequest;
  setForm: Dispatch<SetStateAction<TaskCreateRequest>>;
  /** Tarefa em edição — `null` em modo criação. Controla o campo Projeto herdado, o `taskId` do
   * ícone e se a aba Registros aparece. */
  editing: Task | null;
  /** Todas as tarefas carregadas na tela — usado só pra achar o prazo da tarefa-mãe quando
   * `form.parent_task_id` está setado (limite de prazo de subtarefa). */
  tasks: Task[];
  tags: Tag[];
  onCreateTag: (name: string, color: string) => Promise<Tag>;
  recurrings: Recurring[];
  onRecurringCreated: (recurring: Recurring) => void;
  dimensions: Dimension[];
  subtasks: SubtaskDraft[];
  onAddSubtask: (title: string) => void;
  onRemoveSubtask: (subtask: SubtaskDraft, index: number) => void;
  /**
   * Presença = campo Projeto aparece (`TaskList.tsx`, tarefa sem projeto fixo pela rota);
   * ausência = campo some (`ProjectDetail.tsx`, projeto já fixo pela rota) — mesmo padrão
   * "presença de prop = campo aparece" de `TaskQuickFields` (feature 033).
   */
  projects?: Project[];
}

/**
 * Bloco de abas (Geral/Data e repetição/Organização/Registros) do form de criar/editar tarefa —
 * extraído de `TaskList.tsx`/`ProjectDetail.tsx`, que tinham essa ~150 linhas de JSX duplicadas
 * byte a byte (feature 042). Não é dono do `Dialog`/`DialogContent` em volta nem do botão
 * "Salvar" — cada call site mantém isso, já que a largura do dialog e o `handleSave` divergem
 * entre as duas telas.
 */
export function TaskFormFields({
  formTab,
  onFormTabChange,
  form,
  setForm,
  editing,
  tasks,
  tags,
  onCreateTag,
  recurrings,
  onRecurringCreated,
  dimensions,
  subtasks,
  onAddSubtask,
  onRemoveSubtask,
  projects,
}: TaskFormFieldsProps) {
  return (
    <Tabs value={formTab} onValueChange={(v) => onFormTabChange(v as TaskFormTab)}>
      <TabsList className="grid w-full grid-cols-3 sm:grid-cols-4">
        <TabsTrigger value="geral">Geral</TabsTrigger>
        <TabsTrigger value="data">Data e repetição</TabsTrigger>
        <TabsTrigger value="organizacao">Organização</TabsTrigger>
        {editing && <TabsTrigger value="registros">Registros de tempo</TabsTrigger>}
      </TabsList>

      <TabsContent value="geral" className={cn(FORM_FIELDS_CLASS, "mt-4")}>
        <div>
          <FormLabel required>Título</FormLabel>
          <Input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </div>
        <div>
          <FormLabel optional>Descrição</FormLabel>
          <TaskDescriptionField
            value={form.description ?? ""}
            onChange={(description) => setForm({ ...form, description })}
          />
        </div>
        {projects && (
          <div>
            <FormLabel optional>Projeto</FormLabel>
            {editing?.parent_task_id ? (
              <div className="mt-1.5 flex items-center gap-2 rounded-md border bg-muted/40 px-2.5 py-2 text-sm text-muted-foreground">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{
                    backgroundColor:
                      projects.find((p) => p.id === form.project_id)?.color ?? "#94a3b8",
                  }}
                />
                <span className="truncate">
                  {projects.find((p) => p.id === form.project_id)?.name ?? "Sem projeto"}
                </span>
                <span className="ml-auto shrink-0 text-xs">Herdado da tarefa principal</span>
              </div>
            ) : (
              <div className="mt-1.5">
                <ProjectPicker
                  projects={projects}
                  value={form.project_id}
                  onChange={(projectId) => setForm({ ...form, project_id: projectId })}
                />
              </div>
            )}
          </div>
        )}
        <div>
          <FormLabel optional>Ícone</FormLabel>
          <div className="mt-1.5">
            <TaskIconPicker
              taskId={editing?.id ?? null}
              value={{ icon_key: form.icon_key ?? null, icon_url: form.icon_url ?? null }}
              onChange={(next) => setForm({ ...form, ...next })}
            />
          </div>
        </div>
        <TaskPriorityField
          value={form.priority ?? null}
          onChange={(priority) => setForm({ ...form, priority })}
        />
        <TaskMilestoneField
          value={form.is_milestone ?? false}
          onChange={(is_milestone) => setForm({ ...form, is_milestone })}
        />
      </TabsContent>

      <TabsContent value="data" className={cn(FORM_FIELDS_CLASS, "mt-4")}>
        <TaskRecurrenceField
          value={{
            due_date: form.due_date,
            due_time: form.due_time,
            start_date: form.start_date,
            estimated_duration: form.estimated_duration,
            recurrence_rule: form.recurrence_rule,
            linked_recurring_id: form.linked_recurring_id,
          }}
          recurrings={recurrings}
          onChange={(next) => setForm({ ...form, ...next })}
          dimensions={dimensions}
          onRecurringCreated={onRecurringCreated}
          isSubtask={!!form.parent_task_id}
          parentDueDate={tasks.find((t) => t.id === form.parent_task_id)?.due_date ?? null}
        />
      </TabsContent>

      <TabsContent value="organizacao" className={cn(FORM_FIELDS_CLASS, "mt-4")}>
        <div>
          <FormLabel optional>Tags</FormLabel>
          <TagCombobox
            allTags={tags}
            selectedIds={form.tag_ids}
            onChange={(tag_ids) => setForm({ ...form, tag_ids })}
            onCreateTag={onCreateTag}
          />
        </div>
        <div>
          <FormLabel optional>Link externo</FormLabel>
          <Input
            value={form.external_url ?? ""}
            onChange={(e) =>
              setForm({
                ...form,
                external_url: e.target.value || null,
                external_provider: detectExternalProvider(e.target.value),
              })
            }
            placeholder="https://github.com/owner/repo/issues/123"
          />
        </div>
        {!editing?.parent_task_id && (
          <TaskSubtasksField subtasks={subtasks} onAdd={onAddSubtask} onRemove={onRemoveSubtask} />
        )}
      </TabsContent>

      {editing && (
        <TabsContent value="registros" className={cn(FORM_FIELDS_CLASS, "mt-4")}>
          <TaskTimeEntriesField taskId={editing.id} />
        </TabsContent>
      )}
    </Tabs>
  );
}
