import { useState, type Dispatch, type SetStateAction } from "react";
import { Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ActionTooltip } from "@/components/ActionTooltip";
import { DatePicker } from "@/components/DatePicker";
import { FormLabel } from "@/components/FormLabel";
import { cn } from "@/lib/utils";
import { formatLocalIsoDate } from "@/lib/dates";
import { formatDateBR } from "@/lib/currency";
import {
  detectExternalProvider,
  formatRecurrenceSummary,
  isRecurringTask,
  isSubtaskDueDateValid,
} from "@/domain/tasks";
import { CollapsibleField } from "./CollapsibleField";
import { TaskDescriptionField } from "./TaskDescriptionField";
import { TaskDueShortcuts } from "./TaskDueShortcuts";
import { TaskDurationQuickPick } from "./TaskDurationQuickPick";
import { TaskIconPicker } from "./TaskIconPicker";
import { TaskPriorityField } from "./TaskPriorityField";
import { TaskMilestoneField } from "./TaskMilestoneField";
import { TaskRecurrenceDialog } from "./TaskRecurrenceDialog";
import { TagCombobox } from "./TagCombobox";
import { ProjectBadgeButton } from "./ProjectBadgeButton";
import { TaskSubtasksField } from "./TaskSubtasksField";
import { TaskTimeEntriesField } from "./TaskTimeEntriesField";
import { useTaskRecurrenceEditor, type TaskRecurrenceValue } from "./useTaskRecurrenceEditor";
import type { Project, SubtaskDraft, Tag, Task, TaskCreateRequest } from "@/types/tasks";
import type { Recurring } from "@/types/recurring";
import type { Dimension } from "@/types/dimensions";

/** Quantas letras da descrição aparecem no gatilho colapsado antes das reticências. */
const DESCRIPTION_SUMMARY_MAX = 80;

/** Abaixo de `sm` a densidade some e cada controle volta a ter área de toque confortável
 * (≥44px, regra da `form-design`). Densidade é afordância de desktop. */
const TOUCH_TARGET_CLASS = "min-h-[44px] sm:min-h-0";

const EXTERNAL_URL_HINT = "Comece com https://";

export interface TaskFormFieldsProps {
  form: TaskCreateRequest;
  setForm: Dispatch<SetStateAction<TaskCreateRequest>>;
  /** Tarefa em edição — `null` em modo criação. Controla o campo Projeto herdado, o `taskId` do
   * ícone e se a seção Registros aparece. */
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
 * Formulário de criar/editar tarefa — fonte única usada por `TaskList.tsx`, `ProjectDetail.tsx` e
 * `AgendaGrid.tsx` (feature 042). Não é dono do `Dialog`/`DialogContent` em volta nem do botão
 * "Salvar".
 *
 * Feature 080: deixou de ser **4 abas de uma coluna** e virou um **painel único e denso**, na ordem
 * que o pedido descreve — título → descrição colapsada → (projeto | operadores de tempo) →
 * instrumentos (ícone, prioridade, marco, pontual) lado a lado → tags e link → subtarefas →
 * registros. Nenhum campo foi criado nem removido: é reorganização + progressive disclosure. O que
 * saiu da tela principal (configuração de repetição, descrição longa, subtarefas, registros) está
 * a **um** clique, com o estado resumido visível no gatilho.
 */
export function TaskFormFields({
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
  const [recurrenceOpen, setRecurrenceOpen] = useState(false);
  const [externalUrlError, setExternalUrlError] = useState<string | null>(null);

  const isSubtask = !!form.parent_task_id;
  const parentDueDate = tasks.find((t) => t.id === form.parent_task_id)?.due_date ?? null;

  const recurrenceValue: TaskRecurrenceValue = {
    due_date: form.due_date,
    due_time: form.due_time,
    start_date: form.start_date,
    estimated_duration: form.estimated_duration,
    is_quick: form.is_quick,
    recurrence_rule: form.recurrence_rule,
    linked_recurring_id: form.linked_recurring_id,
  };
  const editor = useTaskRecurrenceEditor({
    value: recurrenceValue,
    onChange: (next) => setForm((prev) => ({ ...prev, ...next })),
  });

  const linkedDescription = form.linked_recurring_id
    ? (recurrings.find((r) => r.id === form.linked_recurring_id)?.description ?? null)
    : null;
  const recurrenceSummary = formatRecurrenceSummary(recurrenceValue, linkedDescription);

  const description = form.description ?? "";
  const descriptionSummary = description.trim()
    ? description.trim().length > DESCRIPTION_SUMMARY_MAX
      ? `${description.trim().slice(0, DESCRIPTION_SUMMARY_MAX)}…`
      : description.trim()
    : null;

  /** Prazo de subtarefa não pode passar do prazo da tarefa-mãe (`isSubtaskDueDateValid` continua
   * sendo a fonte da regra). O aviso é **derivado do valor**, não guardado em estado: assim ele
   * aparece tanto ao escolher uma data inválida quanto ao abrir uma subtarefa que já estava
   * inválida — antes a regra só falhava lá no `handleSave`, como toast. */
  const dueDateError =
    isSubtask && parentDueDate && !isSubtaskDueDateValid(form.due_date, parentDueDate)
      ? `O prazo não pode passar de ${formatDateBR(parentDueDate)}, prazo da tarefa principal.`
      : null;

  const timeOperators = editor.mode !== "linked" && (
    <>
      {!isSubtask && (
        <div className="min-w-[7rem]">
          <FormLabel optional>Duração</FormLabel>
          <div className={cn("mt-1.5 flex items-center", TOUCH_TARGET_CLASS)}>
            <TaskDurationQuickPick
              value={form.estimated_duration}
              isQuick={!!form.is_quick}
              onChange={(minutes) => setForm((prev) => ({ ...prev, estimated_duration: minutes }))}
            />
          </div>
        </div>
      )}
      <div className="min-w-[9rem]">
        <FormLabel optional>Data limite</FormLabel>
        {/* Feature 083: os atalhos vêm **antes** do calendário ("e aí sim o botão do calendário",
            no pedido) e escrevem pelo `editor.selectDueDate` — o mesmo caminho que reconstrói a
            `recurrence_rule` — nunca por `setForm` cru. */}
        <div className={cn("mt-1.5 flex flex-wrap items-center gap-1.5", TOUCH_TARGET_CLASS)}>
          <TaskDueShortcuts
            value={form.due_date}
            onSelect={(iso) => editor.selectDueDate(iso)}
            maxDate={isSubtask ? parentDueDate : null}
          />
          <DatePicker
            clearable
            /* `w-auto` (o padrão do `DatePicker` é `w-full`) para o calendário caber na **mesma
               linha** dos atalhos, na ordem literal do pedido; abaixo de `sm` o `flex-wrap` do pai
               quebra sozinho. */
            className="w-auto"
            date={form.due_date ? new Date(`${form.due_date}T12:00:00`) : undefined}
            ariaLabel={
              form.due_date ? `Data limite — ${formatDateBR(form.due_date)}` : "Data limite"
            }
            onSelect={(d) => editor.selectDueDate(d ? formatLocalIsoDate(d) : null)}
            maxDate={
              isSubtask && parentDueDate ? new Date(`${parentDueDate}T12:00:00`) : undefined
            }
          />
        </div>
        {dueDateError && (
          <p role="alert" className="mt-1 text-xs text-destructive">
            {dueDateError}
          </p>
        )}
      </div>
      {form.due_date && (
        <div className="min-w-[6rem]">
          <FormLabel optional htmlFor="task-due-time">
            Horário
          </FormLabel>
          <Input
            id="task-due-time"
            type="time"
            value={form.due_time ?? ""}
            onChange={(e) => editor.selectDueTime(e.target.value || null)}
            className={cn("mt-1.5 h-9 w-28", TOUCH_TARGET_CLASS)}
          />
        </div>
      )}
      {!isSubtask && (
        <div className="min-w-[9rem]">
          <FormLabel optional>Início</FormLabel>
          <div className={cn("mt-1.5 flex items-center", TOUCH_TARGET_CLASS)}>
            <DatePicker
              clearable
              date={form.start_date ? new Date(`${form.start_date}T12:00:00`) : undefined}
              ariaLabel={form.start_date ? `Início — ${formatDateBR(form.start_date)}` : "Início"}
              onSelect={(d) =>
                setForm((prev) => ({ ...prev, start_date: d ? formatLocalIsoDate(d) : null }))
              }
            />
          </div>
        </div>
      )}
    </>
  );

  return (
    <TooltipProvider delayDuration={300}>
      <div className="grid grid-cols-1 gap-3">
        {/* Bloco 1 — Título, linha inteira, o único obrigatório. */}
        <div>
          <FormLabel required htmlFor="task-title">
            Título
          </FormLabel>
          <Input
            id="task-title"
            aria-required="true"
            autoFocus={!editing}
            value={form.title}
            onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
            className="mt-1.5"
          />
        </div>

        {/* Bloco 2 — Descrição atrás de um gatilho de uma linha; o editor entra intacto. */}
        <CollapsibleField label="Descrição" summary={descriptionSummary}>
          <TaskDescriptionField
            value={description}
            onChange={(next) => setForm((prev) => ({ ...prev, description: next }))}
          />
        </CollapsibleField>

        {/* Bloco 3 — Projeto em 1/3 e os operadores de tempo nos 2/3 restantes. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {projects && (
            <div className="sm:col-span-1">
              <FormLabel optional>Projeto</FormLabel>
              {editing?.parent_task_id ? (
                <div
                  className={cn(
                    "mt-1.5 flex items-center gap-2 rounded-md border bg-muted/40 px-2.5 py-2 text-sm text-muted-foreground",
                    TOUCH_TARGET_CLASS
                  )}
                >
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
                <div className={cn("mt-1.5 flex items-center", TOUCH_TARGET_CLASS)}>
                  <ProjectBadgeButton
                    projects={projects}
                    value={form.project_id}
                    onChange={(projectId) => setForm((prev) => ({ ...prev, project_id: projectId }))}
                  />
                </div>
              )}
            </div>
          )}
          <div
            className={cn(
              "flex flex-wrap items-start gap-x-4 gap-y-3",
              projects ? "sm:col-span-2" : "sm:col-span-3"
            )}
          >
            {timeOperators}
            {!isSubtask && (
              <div className="min-w-[10rem]">
                <FormLabel optional>Recorrência</FormLabel>
                <div className="mt-1.5">
                  <ActionTooltip label={`Repetição da tarefa — ${recurrenceSummary}`}>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label={`Repetição da tarefa — ${recurrenceSummary}`}
                      aria-haspopup="dialog"
                      onClick={() => setRecurrenceOpen(true)}
                      className={cn(
                        "h-9 max-w-full justify-start gap-1.5 px-2.5 text-xs",
                        TOUCH_TARGET_CLASS
                      )}
                    >
                      <Repeat aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{recurrenceSummary}</span>
                    </Button>
                  </ActionTooltip>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bloco 4 — instrumentos lado a lado: é a queixa literal do pedido (ícone e prioridade
            ocupando uma linha inteira cada). */}
        <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
          <div className="min-w-[5rem]">
            <FormLabel optional>Ícone</FormLabel>
            <div className={cn("mt-1.5 flex items-center", TOUCH_TARGET_CLASS)}>
              <TaskIconPicker
                // Feature 073: mesma regra da edição rápida — o ícone é da série, então o upload
                // vai pro caminho da origem e o aviso aparece quando a tarefa é recorrente.
                taskId={editing ? (editing.recurrence_origin_id ?? editing.id) : null}
                value={{ icon_key: form.icon_key ?? null, icon_url: form.icon_url ?? null }}
                onChange={(next) => setForm((prev) => ({ ...prev, ...next }))}
                sharedWithSeries={!!editing && isRecurringTask(editing)}
              />
            </div>
          </div>
          <div className={TOUCH_TARGET_CLASS}>
            <TaskPriorityField
              value={form.priority ?? null}
              onChange={(priority) => setForm((prev) => ({ ...prev, priority }))}
            />
          </div>
          <div className={TOUCH_TARGET_CLASS}>
            <TaskMilestoneField
              value={form.is_milestone ?? false}
              onChange={(is_milestone) => setForm((prev) => ({ ...prev, is_milestone }))}
            />
          </div>
          {/* Feature 070: a flag é o oposto da duração — ligar zera `estimated_duration` (a tarefa
              vira bolinha na agenda, não bloco). */}
          <div className={TOUCH_TARGET_CLASS}>
            <FormLabel optional>Tarefa pontual</FormLabel>
            <label className="mt-1.5 flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={form.is_quick ?? false}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    is_quick: e.target.checked,
                    estimated_duration: e.target.checked ? null : prev.estimated_duration,
                  }))
                }
              />
              Tarefa pontual (sem duração)
            </label>
          </div>
        </div>

        {/* Bloco 5 — onde a tarefa se encaixa. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <FormLabel optional>Tags</FormLabel>
            <TagCombobox
              allTags={tags}
              selectedIds={form.tag_ids}
              onChange={(tag_ids) => setForm((prev) => ({ ...prev, tag_ids }))}
              onCreateTag={onCreateTag}
            />
          </div>
          <div>
            <FormLabel optional htmlFor="task-external-url">
              Link externo
            </FormLabel>
            <Input
              id="task-external-url"
              value={form.external_url ?? ""}
              aria-invalid={externalUrlError ? true : undefined}
              aria-describedby={externalUrlError ? "task-external-url-hint" : undefined}
              onChange={(e) => {
                // Validar a cada tecla acusaria erro no meio da digitação: a checagem é no blur.
                if (externalUrlError) setExternalUrlError(null);
                setForm((prev) => ({
                  ...prev,
                  external_url: e.target.value || null,
                  external_provider: detectExternalProvider(e.target.value),
                }));
              }}
              onBlur={(e) => {
                const url = e.target.value.trim();
                setExternalUrlError(
                  !url || /^https?:\/\//i.test(url) ? null : EXTERNAL_URL_HINT
                );
              }}
              placeholder="https://github.com/owner/repo/issues/123"
              className={cn("mt-1.5", TOUCH_TARGET_CLASS)}
            />
            {externalUrlError && (
              <p id="task-external-url-hint" role="alert" className="mt-1 text-xs text-destructive">
                {externalUrlError}
              </p>
            )}
          </div>
        </div>

        {/* Bloco 6 — subtarefas. Subtarefa não tem sub-subtarefa. */}
        {!editing?.parent_task_id && (
          <CollapsibleField
            label="Subtarefas"
            summary={
              subtasks.length > 0
                ? `${subtasks.length} ${subtasks.length === 1 ? "subtarefa" : "subtarefas"}`
                : null
            }
          >
            <TaskSubtasksField
              subtasks={subtasks}
              onAdd={onAddSubtask}
              onRemove={onRemoveSubtask}
            />
          </CollapsibleField>
        )}

        {/* Bloco 7 — histórico somente-leitura, só faz sentido em tarefa já existente. */}
        {editing && (
          <CollapsibleField label="Registros de tempo" lazy>
            <TaskTimeEntriesField taskId={editing.id} />
          </CollapsibleField>
        )}

        {!isSubtask && (
          <TaskRecurrenceDialog
            open={recurrenceOpen}
            onOpenChange={setRecurrenceOpen}
            value={recurrenceValue}
            editor={editor}
            recurrings={recurrings}
            dimensions={dimensions}
            onRecurringCreated={onRecurringCreated}
            onChange={(next) => setForm((prev) => ({ ...prev, ...next }))}
          />
        )}
      </div>
    </TooltipProvider>
  );
}
