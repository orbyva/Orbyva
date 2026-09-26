import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleDashed,
  GripVertical,
  Pen,
  Play,
  Repeat,
  Square,
  Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { useDroppable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { TaskDeleteDialog } from "./TaskDeleteDialog";
import { ICON_EDIT_BUTTON_CLASS } from "@/components/FormLabel";
import { isRecurringTask, resolveLinkAppearance, type TaskDeleteOption } from "@/domain/tasks";
import { useLinkIconRules } from "@/hooks/useLinkIconRules";
import type {
  Project,
  Tag,
  Task,
  TaskExternalLink,
  TaskPriority,
  TaskStatus,
} from "@/types/tasks";
import type { ReactNode } from "react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { contrastTextColor } from "@/lib/color";
import { TaskIconBadge } from "./TaskIconBadge";
import { TaskQuickFields } from "./TaskQuickFields";
import { TaskStartNowButton } from "./TaskStartNowButton";
import { TaskDescriptionSnippet } from "./TaskDescriptionSnippet";
import type { TaskDueQuickEditValue } from "./TaskDueQuickEdit";
import type { TaskIconValue } from "./TaskIconPicker";

export const STATUSES: TaskStatus[] = ["todo", "doing", "done"];
export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "A fazer",
  doing: "Fazendo",
  done: "Feito",
};
/** Ícone por status — mesmo vocabulário visual usado na Lista (Select de status) e no Kanban
 * (indicador no card), reforçando o que já é implícito pela coluna/rótulo (feature 033). */
export const STATUS_ICONS: Record<TaskStatus, LucideIcon> = {
  todo: Circle,
  doing: CircleDashed,
  done: CheckCircle2,
};

/** Quantos links viram chip antes de o resto virar um "+N" (feature 085). Três é o que cabe na
 * linha do card ao lado de status, prazo e tags sem empurrar tudo para a linha de baixo; quem tem
 * mais abre a tarefa e vê a lista inteira na seção "Links externos". */
export const EXTERNAL_LINK_CHIPS_VISIBLE = 3;

/**
 * Chips dos links externos de uma tarefa (feature 085): **um por link**, cada um com o próprio
 * ícone, o próprio rótulo e o **próprio comentário** no `title`. O comentário é a razão de o link
 * existir e não pode ficar visível só dentro do formulário.
 *
 * Ícone e rótulo saem de `resolveLinkAppearance` com as **regras do usuário** (feature 087): a
 * primeira regra que casa a URL vence, e sem regra nenhuma o resultado é o de antes — issue/PR do
 * GitHub vira "owner/repo#N", o resto cai no host. Era aqui que morava o `if` de GitHub; ele saiu
 * porque reconhecer um serviço novo virou configuração, não deploy.
 *
 * Acima de `EXTERNAL_LINK_CHIPS_VISIBLE`, o excedente vira um único "+N" com os rótulos restantes
 * no `title`. Lista vazia não renderiza nada.
 */
export function ExternalLinkChip({ links }: { links: TaskExternalLink[] }) {
  // Fora do `if` de lista vazia: hook não pode ser condicional. O cache no módulo faz disto uma
  // leitura de memória depois da primeira busca da página.
  const rules = useLinkIconRules();
  if (links.length === 0) return null;
  const visible = links.slice(0, EXTERNAL_LINK_CHIPS_VISIBLE);
  const rest = links.slice(EXTERNAL_LINK_CHIPS_VISIBLE);
  const restLabels = rest
    .map((link) => resolveLinkAppearance(link.url, rules).label)
    .join(", ");
  return (
    <>
      {visible.map((link) => {
        const { iconKey, iconUrl, label } = resolveLinkAppearance(link.url, rules);
        return (
          <a
            key={link.id}
            href={link.url}
            target="_blank"
            rel="noreferrer"
            // Sem comentário, o `title` cai na URL: melhor mostrar para onde o chip leva do que
            // não mostrar nada.
            title={link.comment ?? link.url}
            onClick={(e) => e.stopPropagation()}
            className="flex max-w-[12rem] shrink-0 items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
          >
            {/* `aria-hidden` no wrapper e não no ícone: `TaskIconBadge` põe o próprio `aria-label`
                no preset, e o leitor de tela ouviria "Bandeira" antes do rótulo do link. */}
            <span aria-hidden="true" className="flex shrink-0 items-center">
              <TaskIconBadge iconKey={iconKey} iconUrl={iconUrl} className="h-3 w-3" />
            </span>
            <span className="truncate">{label}</span>
          </a>
        );
      })}
      {rest.length > 0 && (
        <span
          title={restLabels}
          aria-label={`Mais ${rest.length} ${rest.length === 1 ? "link" : "links"}: ${restLabels}`}
          className="shrink-0 text-[10px] text-muted-foreground"
        >
          +{rest.length}
        </span>
      )}
    </>
  );
}

/** Badge de tag colorida estilo GitHub labels (fundo na cor da tag, texto com melhor contraste). */
export function TagBadge({ tag }: { tag: Tag }) {
  return (
    <Badge
      className="border-none text-[10px]"
      style={{ backgroundColor: tag.color, color: contrastTextColor(tag.color) }}
    >
      {tag.name}
    </Badge>
  );
}

/**
 * Handlers de quick action parametrizados por subtarefa — usados por `TaskListRow` pra bindar
 * uma `TaskListRow` aninhada por subtarefa (feature 046), no mesmo espírito de como
 * `CompletedTasksSection` já bindava por tarefa de topo antes de existir aninhamento. `onProjectChange`
 * fica de fora de propósito: subtarefa herda o projeto do pai (mesma regra da feature 036), então o
 * badge de projeto da linha aninhada é sempre somente-leitura (na prática, omitido).
 */
export interface SubtaskRowActions {
  onDelete: (subtask: Task) => void;
  onStatusChange: (subtask: Task, status: TaskStatus) => void;
  onOpenSeries?: (subtask: Task) => void;
  isTimerRunning?: (subtask: Task) => boolean;
  onToggleTimer?: (subtask: Task) => void;
  /** "Imediatamente" na linha aninhada da subtarefa (feature 078) — subtarefa é tarefa completa
   * desde a `036`, então ela tem timer e prazo próprios como qualquer outra. */
  onStartNow?: (subtask: Task) => void;
  isStartingNow?: (subtask: Task) => boolean;
  onIconChange?: (subtask: Task, next: TaskIconValue) => void;
  onPriorityChange?: (subtask: Task, priority: TaskPriority | null) => void;
  onDueChange?: (subtask: Task, next: TaskDueQuickEditValue) => void;
  /** Abertura/fechamento do popover de prazo da subtarefa (feature 081) — mesma semântica da
   * linha de topo: fechar descongela e recarrega. */
  onDueOpenChange?: (subtask: Task, open: boolean) => void;
}

export function ExpandSubtasksButton({
  count,
  expanded,
  onClick,
}: {
  count: number;
  expanded: boolean;
  onClick: () => void;
}) {
  if (count === 0) return null;
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-6 w-6 shrink-0"
      onClick={onClick}
      aria-label={expanded ? "Recolher subtarefas" : "Expandir subtarefas"}
    >
      {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
    </Button>
  );
}

export function TaskListRow({
  task,
  subtasks,
  allTags,
  expanded,
  onToggleExpand,
  onToggleSubtask,
  onOpenSubtask,
  onToggleDone,
  onStatusChange,
  onOpenSeries,
  onEdit,
  onDelete,
  onDeleteScoped,
  isTimerRunning,
  onToggleTimer,
  onStartNow,
  isStartingNow,
  extraActions,
  projectBadge,
  onIconChange,
  onPriorityChange,
  onDueChange,
  onDueOpenChange,
  onProjectChange,
  projects,
  externalLinksByTask,
  isNested = false,
  subtaskActions,
}: {
  task: Task;
  subtasks: Task[];
  /** Catálogo completo de tags do usuário — usado pra resolver `task.tag_ids` nos badges coloridos. */
  allTags: Tag[];
  expanded: boolean;
  onToggleExpand: () => void;
  onToggleSubtask: (subtask: Task) => void;
  onOpenSubtask: (subtask: Task) => void;
  onToggleDone: () => void;
  /** Select inline de status (A fazer/Fazendo/Feito) — `onToggleDone` continua como atalho
   * rápido pra concluir/reabrir; o Select cobre o caso "Fazendo" que o atalho binário não cobre. */
  onStatusChange: (status: TaskStatus) => void;
  onOpenSeries: () => void;
  onEdit: () => void;
  onDelete: () => void;
  /** Exclui um conjunto a partir desta tarefa: a série inteira de uma recorrência simples, ou as
   * doses do tratamento (feature 075). O escopo é resolvido no servidor a partir da opção — a lista
   * carregada na tela não participa. Ausente, o `TaskDeleteDialog` só oferece "Excluir".  */
  onDeleteScoped?: (task: Task, option: TaskDeleteOption) => void;
  /** Timer "Live" rodando pra esta tarefa agora. */
  isTimerRunning?: boolean;
  onToggleTimer?: () => void;
  /** Presente = botão "Imediatamente" ao lado do Play (feature 078): um clique inicia o timer e
   * grava o prazo como agora + duração estimada. Ausente = botão some (mesmo padrão opcional dos
   * outros handlers desta linha). */
  onStartNow?: () => void;
  /** "Imediatamente" desta tarefa em voo — desabilita o botão pra não abrir dois registros de
   * tempo com clique duplo. */
  isStartingNow?: boolean;
  /** Ações extras (ex.: "Lançar transação") renderizadas antes de editar/excluir. */
  extraActions?: ReactNode;
  /** Badge do projeto somente-leitura — usado quando `onProjectChange` não é passado (mantém
   * compatibilidade com quem ainda monta o badge por fora, ex. `KanbanCard`). Ignorado quando
   * `onProjectChange` está presente (vira `ProjectBadgeButton` clicável). */
  projectBadge?: ReactNode;
  /** Presente = edição rápida de ícone inline (popover com `TaskIconPicker`), no lugar do
   * `TaskIconBadge` estático (feature 035). */
  onIconChange?: (next: TaskIconValue) => void;
  /** Presente = edição rápida de prioridade inline (popover com `TaskPriorityField`), no lugar do
   * ícone estático `TaskPriorityFlag` (feature 029). */
  onPriorityChange?: (priority: TaskPriority | null) => void;
  /** Presente = edição rápida de prazo+horário+duração inline (popover com `DatePicker` +
   * horário + duração estimada), no lugar do texto estático de prazo — só se aplica a tarefas não
   * concluídas ("Concluída em..." continua somente-leitura) (feature 029). */
  onDueChange?: (next: TaskDueQuickEditValue) => void;
  /** Abertura/fechamento do popover de prazo (feature 081) — a Lista congela a posição da linha
   * enquanto ele está aberto e reagrupa quando fecha. */
  onDueOpenChange?: (open: boolean) => void;
  /** Presente (junto com `projects`) = badge de projeto clicável (`ProjectBadgeButton`) no lugar
   * de `projectBadge` estático (feature 029). */
  onProjectChange?: (projectId: string | null) => void;
  /** Catálogo de projetos (já ordenado por atividade) — obrigatório junto com `onProjectChange`. */
  projects?: Project[];
  /** Links externos por tarefa (feature 085), carregados em **lote** pelo dono da página
   * (`fetchExternalLinksForTasks` no `load()`). É o mapa inteiro, e não só os desta linha, porque a
   * linha aninhada da subtarefa é a mesma `TaskListRow` e precisa dos dela — mesmo formato de
   * `subtasksByParent`. Ausente = nenhum chip; nada é buscado aqui (uma consulta por linha seria
   * uma ida ao banco por tarefa a cada render). */
  externalLinksByTask?: Record<string, TaskExternalLink[]>;
  /** `true` = esta linha é uma subtarefa renderizada aninhada sob a linha da tarefa-mãe (feature
   * 046): aplica indentação/borda visual distinta e desliga `ExpandSubtasksButton`/o próprio
   * aninhamento (sem sub-subtarefas — modelo de 2 níveis já estabelecido pela feature 036). */
  isNested?: boolean;
  /** Handlers de quick action parametrizados por subtarefa — obrigatório pra renderizar
   * subtarefas de verdade quando `expanded`; ignorado em linhas já `isNested` (não há 3º nível). */
  subtaskActions?: SubtaskRowActions;
}) {
  const taskTags = task.tag_ids
    .map((id) => allTags.find((t) => t.id === id))
    .filter((t): t is Tag => !!t);
  const recurring = isRecurringTask(task);
  const done = task.status === "done";
  const quickFields = TaskQuickFields({
    task,
    onIconChange,
    onPriorityChange,
    onDueChange,
    onDueOpenChange,
    onProjectChange,
    projects,
    projectBadge,
  });
  const StatusIcon = STATUS_ICONS[task.status];
  return (
    <div
      className={cn(
        "cursor-pointer rounded-lg border bg-card p-3 transition-colors hover:border-primary/40",
        isNested && "ml-6 border-l-2 border-l-primary/30 bg-muted/20"
      )}
      onClick={onEdit}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleDone();
            }}
            aria-label={done ? "Reabrir tarefa" : "Concluir tarefa"}
            className={cn(
              "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
              done
                ? "border-primary bg-primary text-primary-foreground"
                : "border-muted-foreground/40 hover:border-primary"
            )}
          >
            {done && <Check className="h-3 w-3" />}
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              {recurring && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenSeries();
                  }}
                  aria-label="Ver ocorrências"
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <Repeat className="h-3 w-3" />
                </button>
              )}
              {quickFields.priority}
              <p
                className={cn(
                  "truncate font-medium",
                  done && "text-muted-foreground line-through"
                )}
              >
                {task.title}
              </p>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              {quickFields.icon}
              <Select value={task.status} onValueChange={(v) => onStatusChange(v as TaskStatus)}>
                <SelectTrigger
                  onClick={(e) => e.stopPropagation()}
                  title={STATUS_LABELS[task.status]}
                  aria-label={`Status: ${STATUS_LABELS[task.status]}`}
                  className="h-5 w-auto gap-1 border-none bg-transparent px-1.5 py-0 text-[10px] font-semibold text-muted-foreground shadow-none hover:bg-muted [&>svg]:h-3 [&>svg]:w-3"
                >
                  <SelectValue>
                    <span className="flex items-center gap-1">
                      <StatusIcon className="h-3 w-3" />
                    </span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((status) => {
                    const ItemIcon = STATUS_ICONS[status];
                    return (
                      <SelectItem key={status} value={status}>
                        <span className="flex items-center gap-1.5">
                          <ItemIcon className="h-3 w-3" />
                          {STATUS_LABELS[status]}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {quickFields.project}
              {task.linked_recurring_id && (
                <Badge variant="outline" className="text-[10px]">
                  Vinculada a Recorrência
                </Badge>
              )}
              {quickFields.due}
              {taskTags.map((tag) => (
                <TagBadge key={tag.id} tag={tag} />
              ))}
              <ExternalLinkChip links={externalLinksByTask?.[task.id] ?? []} />
            </div>
            {task.description && (
              <TaskDescriptionSnippet description={task.description} className="mt-1" />
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {onToggleTimer && !done && (
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-8 w-8", isTimerRunning ? "text-primary" : "text-muted-foreground hover:text-foreground")}
              onClick={onToggleTimer}
              aria-label={isTimerRunning ? "Parar timer" : "Iniciar timer"}
            >
              {isTimerRunning ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            </Button>
          )}
          {onStartNow && !done && (
            <TaskStartNowButton onClick={onStartNow} pending={isStartingNow} size="row" />
          )}
          {extraActions}
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={onEdit}>
            <Pen className="h-3.5 w-3.5" />
          </Button>
          <TaskDeleteDialog
            task={task}
            onConfirm={onDelete}
            onConfirmScoped={onDeleteScoped ? (option) => onDeleteScoped(task, option) : undefined}
          >
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </TaskDeleteDialog>
          {!isNested && (
            <ExpandSubtasksButton count={subtasks.length} expanded={expanded} onClick={onToggleExpand} />
          )}
        </div>
      </div>
      {!isNested && expanded && subtasks.length > 0 && (
        <div className="mt-2 space-y-2 border-t pt-2" onClick={(e) => e.stopPropagation()}>
          {subtasks.map((subtask) => (
            <TaskListRow
              key={subtask.id}
              task={subtask}
              subtasks={[]}
              allTags={allTags}
              expanded={false}
              onToggleExpand={() => {}}
              onToggleSubtask={onToggleSubtask}
              onOpenSubtask={onOpenSubtask}
              onToggleDone={() => onToggleSubtask(subtask)}
              onStatusChange={(status) => subtaskActions?.onStatusChange(subtask, status)}
              onOpenSeries={() => subtaskActions?.onOpenSeries?.(subtask)}
              onEdit={() => onOpenSubtask(subtask)}
              onDelete={() => subtaskActions?.onDelete(subtask)}
              isTimerRunning={subtaskActions?.isTimerRunning?.(subtask)}
              onToggleTimer={
                subtaskActions?.onToggleTimer
                  ? () => subtaskActions.onToggleTimer!(subtask)
                  : undefined
              }
              onStartNow={
                subtaskActions?.onStartNow
                  ? () => subtaskActions.onStartNow!(subtask)
                  : undefined
              }
              isStartingNow={subtaskActions?.isStartingNow?.(subtask)}
              onIconChange={
                subtaskActions?.onIconChange
                  ? (next) => subtaskActions.onIconChange!(subtask, next)
                  : undefined
              }
              onPriorityChange={
                subtaskActions?.onPriorityChange
                  ? (priority) => subtaskActions.onPriorityChange!(subtask, priority)
                  : undefined
              }
              onDueChange={
                subtaskActions?.onDueChange
                  ? (next) => subtaskActions.onDueChange!(subtask, next)
                  : undefined
              }
              onDueOpenChange={
                subtaskActions?.onDueOpenChange
                  ? (open) => subtaskActions.onDueOpenChange!(subtask, open)
                  : undefined
              }
              externalLinksByTask={externalLinksByTask}
              isNested
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Seção "Concluídas" recolhível — sem agrupamento por prazo, cada tarefa já vem ordenada por
 * quem chama (`sortTasksByCompletedAtDesc`). Remonta (perde estado de aberto/fechado) quando o
 * `key` passado pela página muda, o que a página usa pra abrir por padrão no filtro "Concluídas"
 * e fechada dentro de "Todas". */
export function CompletedTasksSection({
  tasks,
  allTags,
  subtasksByParent,
  expandedTasks,
  onToggleExpand,
  onToggleSubtask,
  onOpenSubtask,
  onToggleDone,
  onStatusChange,
  onOpenSeries,
  onEdit,
  onDelete,
  onDeleteScoped,
  isTimerRunning,
  extraActions,
  projectBadge,
  defaultOpen = false,
  onIconChange,
  onPriorityChange,
  onDueChange,
  onDueOpenChange,
  onProjectChange,
  projects,
  externalLinksByTask,
  subtaskActions,
}: {
  tasks: Task[];
  allTags: Tag[];
  subtasksByParent: Map<string, Task[]>;
  expandedTasks: Set<string>;
  onToggleExpand: (taskId: string) => void;
  onToggleSubtask: (subtask: Task) => void;
  onOpenSubtask: (subtask: Task) => void;
  onToggleDone: (task: Task) => void;
  onStatusChange: (task: Task, status: TaskStatus) => void;
  onOpenSeries: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
  onDeleteScoped?: (task: Task, option: TaskDeleteOption) => void;
  isTimerRunning: (task: Task) => boolean;
  extraActions?: (task: Task) => ReactNode;
  projectBadge?: (task: Task) => ReactNode;
  defaultOpen?: boolean;
  /** Repassadas por tarefa a cada `TaskListRow` — mesma edição rápida inline da feature 029. */
  onIconChange?: (task: Task, next: TaskIconValue) => void;
  onPriorityChange?: (task: Task, priority: TaskPriority | null) => void;
  onDueChange?: (task: Task, next: TaskDueQuickEditValue) => void;
  /** Abertura/fechamento do popover de prazo por tarefa (feature 081). */
  onDueOpenChange?: (task: Task, open: boolean) => void;
  onProjectChange?: (task: Task, projectId: string | null) => void;
  projects?: Project[];
  /** Repassado direto a cada `TaskListRow` — o mesmo mapa em lote da feature 085. */
  externalLinksByTask?: Record<string, TaskExternalLink[]>;
  /** Repassado direto a cada `TaskListRow` — já vem parametrizado por tarefa (feature 046), mesmo
   * formato que os handlers acima, só sem precisar de wrapping aqui. */
  subtaskActions?: SubtaskRowActions;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (tasks.length === 0) return null;
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          Concluídas <span className="font-normal">({tasks.length})</span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-2">
        {tasks.map((task) => (
          <TaskListRow
            key={task.id}
            task={task}
            subtasks={subtasksByParent.get(task.id) ?? []}
            allTags={allTags}
            expanded={expandedTasks.has(task.id)}
            onToggleExpand={() => onToggleExpand(task.id)}
            onToggleSubtask={onToggleSubtask}
            onOpenSubtask={onOpenSubtask}
            onToggleDone={() => onToggleDone(task)}
            onStatusChange={(status) => onStatusChange(task, status)}
            onOpenSeries={() => onOpenSeries(task)}
            onEdit={() => onEdit(task)}
            onDelete={() => onDelete(task.id)}
            onDeleteScoped={onDeleteScoped}
            isTimerRunning={isTimerRunning(task)}
            extraActions={extraActions?.(task)}
            projectBadge={projectBadge?.(task)}
            onIconChange={onIconChange ? (next) => onIconChange(task, next) : undefined}
            onPriorityChange={
              onPriorityChange ? (priority) => onPriorityChange(task, priority) : undefined
            }
            onDueChange={onDueChange ? (next) => onDueChange(task, next) : undefined}
            onDueOpenChange={
              onDueOpenChange ? (open) => onDueOpenChange(task, open) : undefined
            }
            onProjectChange={
              onProjectChange ? (projectId) => onProjectChange(task, projectId) : undefined
            }
            projects={projects}
            externalLinksByTask={externalLinksByTask}
            subtaskActions={subtaskActions}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function KanbanColumn({ status, children }: { status: TaskStatus; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div
      ref={setNodeRef}
      className={cn("space-y-2 rounded-lg p-1 transition-colors", isOver && "bg-muted/60")}
    >
      {children}
    </div>
  );
}

/**
 * Mini-card de subtarefa dentro do `KanbanCard` do pai (feature 047) — substitui o antigo
 * checklist de checkboxes por um card real, sempre agrupado sob o pai, na coluna do pai (a
 * subtarefa não é sortable/arrastável entre colunas: essa tensão de design foi resolvida
 * explicitamente na feature, ver `docs/features/done/047-*.md`). Reaproveita `TaskQuickFields`
 * (ícone/prioridade/prazo) e o mesmo Select de status por `STATUS_ICONS` que `TaskListRow` usa,
 * só num layout compacto e sem `GripVertical`.
 */
function KanbanSubtaskCard({
  subtask,
  onToggleSubtask,
  onOpenSubtask,
  subtaskActions,
}: {
  subtask: Task;
  onToggleSubtask: (subtask: Task) => void;
  onOpenSubtask: (subtask: Task) => void;
  subtaskActions?: SubtaskRowActions;
}) {
  const done = subtask.status === "done";
  const quickFields = TaskQuickFields({
    task: subtask,
    onIconChange: subtaskActions?.onIconChange
      ? (next) => subtaskActions.onIconChange!(subtask, next)
      : undefined,
    onPriorityChange: subtaskActions?.onPriorityChange
      ? (priority) => subtaskActions.onPriorityChange!(subtask, priority)
      : undefined,
    onDueChange: subtaskActions?.onDueChange
      ? (next) => subtaskActions.onDueChange!(subtask, next)
      : undefined,
    onDueOpenChange: subtaskActions?.onDueOpenChange
      ? (open) => subtaskActions.onDueOpenChange!(subtask, open)
      : undefined,
  });
  const StatusIcon = STATUS_ICONS[subtask.status];
  return (
    <div
      className="cursor-pointer rounded-lg border bg-muted/30 p-2 transition-colors hover:border-primary/40"
      onClick={() => onOpenSubtask(subtask)}
    >
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleSubtask(subtask);
          }}
          aria-label={done ? "Reabrir subtarefa" : "Concluir subtarefa"}
          className={cn(
            "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
            done
              ? "border-primary bg-primary text-primary-foreground"
              : "border-muted-foreground/40 hover:border-primary"
          )}
        >
          {done && <Check className="h-2.5 w-2.5" />}
        </button>
        {quickFields.priority}
        <p
          className={cn(
            "min-w-0 flex-1 truncate text-xs font-medium",
            done && "text-muted-foreground line-through"
          )}
        >
          {subtask.title}
        </p>
      </div>
      <div
        className="mt-1 flex flex-wrap items-center gap-1.5 pl-[22px] text-[10px] text-muted-foreground"
        onClick={(e) => e.stopPropagation()}
      >
        {quickFields.icon}
        {subtaskActions ? (
          <Select
            value={subtask.status}
            onValueChange={(v) => subtaskActions.onStatusChange(subtask, v as TaskStatus)}
          >
            <SelectTrigger
              title={STATUS_LABELS[subtask.status]}
              aria-label={`Status: ${STATUS_LABELS[subtask.status]}`}
              className="h-4 w-auto gap-1 border-none bg-transparent px-1 py-0 text-[10px] font-semibold text-muted-foreground shadow-none hover:bg-muted [&>svg]:h-2.5 [&>svg]:w-2.5"
            >
              <SelectValue>
                <span className="flex items-center gap-1">
                  <StatusIcon className="h-2.5 w-2.5" />
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((status) => {
                const ItemIcon = STATUS_ICONS[status];
                return (
                  <SelectItem key={status} value={status}>
                    <span className="flex items-center gap-1.5">
                      <ItemIcon className="h-3 w-3" />
                      {STATUS_LABELS[status]}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        ) : (
          <span
            className="flex items-center gap-1"
            title={STATUS_LABELS[subtask.status]}
            aria-label={`Status: ${STATUS_LABELS[subtask.status]}`}
          >
            <StatusIcon className="h-2.5 w-2.5" />
          </span>
        )}
        {quickFields.due}
      </div>
    </div>
  );
}

export function KanbanCard({
  task,
  colIndex,
  subtasks,
  allTags,
  subtaskDraft,
  onSubtaskDraftChange,
  onAddSubtask,
  onToggleSubtask,
  onEdit,
  onDelete,
  onDeleteScoped,
  onMoveStatus,
  isTimerRunning,
  onToggleTimer,
  onStartNow,
  isStartingNow,
  onOpenSubtask,
  /** Badge do projeto — só faz sentido num Kanban que cruza projetos (ex.: aba Kanban de
   * `TaskList.tsx`); o Kanban de dentro de um projeto (`ProjectDetail.tsx`) não passa isso.
   * Ignorado quando `onProjectChange` + `projects` estão presentes (vira `ProjectBadgeButton`
   * clicável, feature 033). */
  projectBadge,
  onIconChange,
  onPriorityChange,
  onDueChange,
  onDueOpenChange,
  onProjectChange,
  projects,
  externalLinksByTask,
  subtaskActions,
}: {
  task: Task;
  colIndex: number;
  subtasks: Task[];
  allTags: Tag[];
  subtaskDraft: string;
  onSubtaskDraftChange: (value: string) => void;
  onAddSubtask: () => void;
  /** Toggle binário concluir/reabrir por subtarefa — usado pelo botão redondo do mini-card
   * (feature 047), mesmo espírito do botão equivalente em `TaskListRow`. */
  onToggleSubtask: (subtask: Task) => void;
  onEdit: () => void;
  onDelete: () => void;
  onDeleteScoped?: (task: Task, option: TaskDeleteOption) => void;
  onMoveStatus: (direction: -1 | 1) => void;
  isTimerRunning?: boolean;
  onToggleTimer?: () => void;
  /** Presente = botão "Imediatamente" ao lado do Play (feature 078), igual ao da linha da Lista. */
  onStartNow?: () => void;
  isStartingNow?: boolean;
  onOpenSubtask: (subtask: Task) => void;
  projectBadge?: ReactNode;
  /** Presente = edição rápida de ícone inline (mesmo popover de `TaskListRow`), no lugar do
   * `TaskIconBadge` estático (feature 035). */
  onIconChange?: (next: TaskIconValue) => void;
  /** Presente = edição rápida de prioridade inline (mesmo popover de `TaskListRow`), no lugar do
   * ícone estático `TaskPriorityFlag` (feature 033). */
  onPriorityChange?: (priority: TaskPriority | null) => void;
  /** Presente = edição rápida de prazo+horário+duração inline, no lugar do texto estático de
   * prazo (feature 033). */
  onDueChange?: (next: TaskDueQuickEditValue) => void;
  /** Abertura/fechamento do popover de prazo (feature 081) — o Kanban agrupa por status, então
   * aqui isso só serve pra quem chama recarregar; a coluna não muda por prazo. */
  onDueOpenChange?: (open: boolean) => void;
  /** Presente (junto com `projects`) = badge de projeto clicável no lugar de `projectBadge`
   * estático (feature 033). */
  onProjectChange?: (projectId: string | null) => void;
  /** Catálogo de projetos (já ordenado por atividade) — obrigatório junto com `onProjectChange`. */
  projects?: Project[];
  /** Links externos por tarefa (feature 085), carregados em lote pelo dono da página — mesmo mapa
   * que `TaskListRow` recebe. */
  externalLinksByTask?: Record<string, TaskExternalLink[]>;
  /** Handlers de quick action parametrizados por subtarefa (mesma interface que `TaskListRow`
   * usa desde a feature 046) — presente = mini-card de subtarefa ganha status editável (Select,
   * sem mudar de coluna) e ícone/prioridade/prazo clicáveis; ausente = cai pro visual
   * somente-leitura equivalente (feature 047). */
  subtaskActions?: SubtaskRowActions;
}) {
  const taskTags = task.tag_ids
    .map((id) => allTags.find((t) => t.id === id))
    .filter((t): t is Tag => !!t);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const doneSubtasks = subtasks.filter((s) => s.status === "done").length;
  const quickFields = TaskQuickFields({
    task,
    onIconChange,
    onPriorityChange,
    onDueChange,
    onDueOpenChange,
    onProjectChange,
    projects,
    projectBadge,
  });
  const StatusIcon = STATUS_ICONS[task.status];

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={cn(
        "cursor-pointer space-y-2 rounded-xl border bg-card p-3 shadow-sm transition-colors hover:border-primary/40",
        isDragging && "opacity-40"
      )}
      onClick={onEdit}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          <button
            type="button"
            className="shrink-0 cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
            aria-label="Arrastar tarefa"
            onClick={(e) => e.stopPropagation()}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
          {quickFields.priority}
          <p className="min-w-0 truncate text-sm font-medium">{task.title}</p>
        </div>
        <div className="flex shrink-0 gap-0.5" onClick={(e) => e.stopPropagation()}>
          {onToggleTimer && task.status !== "done" && (
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-7 w-7", isTimerRunning ? "text-primary" : "text-muted-foreground")}
              onClick={onToggleTimer}
              aria-label={isTimerRunning ? "Parar timer" : "Iniciar timer"}
            >
              {isTimerRunning ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            </Button>
          )}
          {onStartNow && task.status !== "done" && (
            <TaskStartNowButton onClick={onStartNow} pending={isStartingNow} size="card" />
          )}
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-7 w-7", ICON_EDIT_BUTTON_CLASS)}
            onClick={onEdit}
          >
            <Pen className="h-3 w-3" />
          </Button>
          <TaskDeleteDialog
            task={task}
            description={
              subtasks.length > 0 ? "As subtarefas também serão excluídas." : undefined
            }
            onConfirm={onDelete}
            onConfirmScoped={onDeleteScoped ? (option) => onDeleteScoped(task, option) : undefined}
          >
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive">
              <Trash2 className="h-3 w-3" />
            </Button>
          </TaskDeleteDialog>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        {quickFields.icon}
        <span
          className="flex items-center gap-1"
          title={STATUS_LABELS[task.status]}
          aria-label={`Status: ${STATUS_LABELS[task.status]}`}
        >
          <StatusIcon className="h-3 w-3" />
        </span>
        {quickFields.project}
        {quickFields.due}
        {task.linked_recurring_id && (
          <Badge variant="outline" className="text-[10px]">
            Vinculada a Recorrência
          </Badge>
        )}
        {subtasks.length > 0 && (
          <Badge variant="outline" className="text-[10px]">
            {doneSubtasks}/{subtasks.length} subtarefas
          </Badge>
        )}
        {taskTags.map((tag) => (
          <TagBadge key={tag.id} tag={tag} />
        ))}
        <ExternalLinkChip links={externalLinksByTask?.[task.id] ?? []} />
      </div>

      {task.description && (
        <TaskDescriptionSnippet description={task.description} />
      )}

      {subtasks.length > 0 && (
        <div className="space-y-1.5 border-t pt-2" onClick={(e) => e.stopPropagation()}>
          {subtasks.map((subtask) => (
            <KanbanSubtaskCard
              key={subtask.id}
              subtask={subtask}
              onToggleSubtask={onToggleSubtask}
              onOpenSubtask={onOpenSubtask}
              subtaskActions={subtaskActions}
            />
          ))}
        </div>
      )}

      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
        <Input
          value={subtaskDraft}
          onChange={(e) => onSubtaskDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onAddSubtask();
          }}
          placeholder="Adicionar subtarefa"
          className="h-7 text-xs"
        />
      </div>

      <div className="flex justify-between border-t pt-2" onClick={(e) => e.stopPropagation()}>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            disabled={colIndex === 0}
            onClick={() => onMoveStatus(-1)}
            aria-label="Mover para trás"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            disabled={colIndex === STATUSES.length - 1}
            onClick={() => onMoveStatus(1)}
            aria-label="Mover para frente"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
        {task.status === "done" && !task.linked_recurring_id && (
          <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" asChild>
            <Link
              to={`/finance/transactions?new=1&nature=despesa&desc=${encodeURIComponent(task.title)}`}
            >
              Lançar transação
            </Link>
          </Button>
        )}
      </div>
    </article>
  );
}
