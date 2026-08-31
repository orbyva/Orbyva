import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Badge } from "@/components/ui/badge";
import { formatDateTimeBR } from "@/lib/currency";
import { cn } from "@/lib/utils";
import {
  AGENDA_BUCKET_LABELS,
  AGENDA_BUCKET_ORDER,
  groupTasksByAgendaBucket,
} from "@/domain/tasks/agenda";
import {
  priorityLabel,
  reorderIntoBand,
  reorderWithinBand,
  type TaskSortOrderPair,
} from "@/domain/tasks/priority";
import { TaskPriorityFlag } from "./TaskPriorityField";
import type { Task, TaskPriority } from "@/types/tasks";

type PriorityKey = TaskPriority | "none";

const PRIORITY_ORDER: PriorityKey[] = ["high", "medium", "low", "none"];

/**
 * A faixa **não** é um droppable próprio, de propósito: um alvo do tamanho da faixa cobriria as
 * linhas dela e disputaria a colisão com elas (o `closestCenter` compara centros, e o centro da
 * faixa cai exatamente em cima de uma linha do meio), deixando a solta imprevisível. Como faixa
 * vazia fica escondida, toda faixa visível tem pelo menos uma linha para receber a solta — e o
 * `closestCenter` sempre devolve a linha mais próxima, mesmo quando o ponteiro está sobre o
 * cabeçalho.
 */
function bandOf(task: Task): PriorityKey {
  return task.priority ?? "none";
}

/** `null` para a faixa "sem prioridade" — é o que `updateTask` grava em `task.priority`. */
function priorityOfBand(band: PriorityKey): TaskPriority | null {
  return band === "none" ? null : band;
}

/**
 * Agrupa por faixa e ordena cada faixa por `sort_order` asc (feature 082).
 *
 * O desempate é o **comparador da tela** (feature 079): `tasks` chega já ordenado por ele, e
 * `Array.prototype.sort` é estável, então tarefas empatadas em `sort_order` mantêm exatamente a
 * ordem que vieram. Isso é o que faz a faixa recém-migrada (todas em `0`) aparecer ordenada por
 * última atualização em vez de ordem indefinida, e o arraste ganhar assim que existir.
 *
 * Só o painel "Por prioridade" passa por aqui — o painel "Por prazo" agrupa a lista crua e ignora
 * `sort_order`, como o contrato com a `079` manda.
 */
function groupTasksByPriority(tasks: Task[]): Record<PriorityKey, Task[]> {
  const groups: Record<PriorityKey, Task[]> = {
    high: [],
    medium: [],
    low: [],
    none: [],
  };
  for (const task of tasks) {
    groups[bandOf(task)].push(task);
  }
  for (const band of PRIORITY_ORDER) {
    groups[band].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }
  return groups;
}

/** Onde a tarefa arrastada vai parar, em linguagem de gente: faixa, posição e total. `null` quando
 * o alvo não é faixa nenhuma. */
function dropLocation(
  byPriority: Record<PriorityKey, Task[]>,
  activeId: string,
  overId: string,
): { band: string; position: number; total: number } | null {
  const band =
    PRIORITY_ORDER.find((key) => byPriority[key].some((task) => task.id === overId)) ?? null;
  if (!band) return null;
  const list = byPriority[band];
  const alreadyThere = list.some((task) => task.id === activeId);
  const total = alreadyThere ? list.length : list.length + 1;
  const overIndex = list.findIndex((task) => task.id === overId);
  return {
    band: priorityLabel(priorityOfBand(band)),
    position: overIndex === -1 ? total : overIndex + 1,
    total,
  };
}

/**
 * Anúncios do arraste para leitor de tela (feature 082). O `@dnd-kit` rende esses textos numa
 * região `role="status"`; sem eles a reordenação por teclado seria silenciosa — a pessoa move a
 * linha e não recebe confirmação nenhuma de onde ela foi parar. Exportado para ter teste próprio.
 */
export function buildQuadrantAnnouncements(byPriority: Record<PriorityKey, Task[]>): Announcements {
  const titleOf = (id: string | number): string => {
    for (const band of PRIORITY_ORDER) {
      const found = byPriority[band].find((task) => task.id === String(id));
      if (found) return found.title;
    }
    return "a tarefa";
  };
  return {
    onDragStart: ({ active }) =>
      `Pegou ${titleOf(active.id)}. Use as setas para mover, Espaço para soltar e Esc para cancelar.`,
    onDragOver: ({ active, over }) => {
      if (!over) return `${titleOf(active.id)} está fora de qualquer faixa.`;
      const at = dropLocation(byPriority, String(active.id), String(over.id));
      if (!at) return `${titleOf(active.id)} está fora de qualquer faixa.`;
      return `${titleOf(active.id)} na posição ${at.position} de ${at.total} da faixa ${at.band}.`;
    },
    onDragEnd: ({ active, over }) => {
      if (!over) return `${titleOf(active.id)} voltou para o lugar de origem.`;
      const at = dropLocation(byPriority, String(active.id), String(over.id));
      if (!at) return `${titleOf(active.id)} voltou para o lugar de origem.`;
      return `${titleOf(active.id)} solta na posição ${at.position} de ${at.total} da faixa ${at.band}.`;
    },
    onDragCancel: ({ active }) => `Arraste de ${titleOf(active.id)} cancelado — a ordem não mudou.`,
  };
}

const SCREEN_READER_INSTRUCTIONS = {
  draggable:
    "Para reordenar esta tarefa, pressione Espaço. Use as setas para mover dentro da faixa ou para faixas vizinhas, Espaço de novo para soltar e Esc para cancelar. Enter abre a tarefa.",
};

const ROW_CLASS =
  "flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs hover:bg-muted";

function QuadrantRowContent({ task }: { task: Task }) {
  return (
    <>
      <TaskPriorityFlag priority={task.priority} />
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          task.status === "done" && "text-muted-foreground line-through",
        )}
      >
        {task.title}
      </span>
      {task.due_date && (
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {formatDateTimeBR(task.due_date, task.due_time)}
        </span>
      )}
    </>
  );
}

/** Linha do painel "Por prazo": clicável, não arrastável (a ordem manual só vale para prioridade —
 * feature 082, Decisões). */
function QuadrantTaskRow({ task, onSelect }: { task: Task; onSelect: () => void }) {
  return (
    <button type="button" onClick={onSelect} className={ROW_CLASS}>
      <QuadrantRowContent task={task} />
    </button>
  );
}

/**
 * Linha do painel "Por prioridade": a própria linha é a alça de arraste (feature 082, Decisões).
 * O `onClick` que abre a tarefa continua valendo — o `PointerSensor` só ativa depois de 5px de
 * movimento e o `@dnd-kit` engole o `click` que vem depois de um arraste de verdade.
 */
function SortableQuadrantTaskRow({ task, onSelect }: { task: Task; onSelect: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });
  return (
    <button
      type="button"
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={onSelect}
      className={cn(ROW_CLASS, "touch-none", isDragging && "opacity-40")}
      {...attributes}
      {...listeners}
    >
      <QuadrantRowContent task={task} />
    </button>
  );
}

/**
 * "Quadrante" de um projeto selecionado (`projectFilter` específico) — combina duas visões da
 * mesma lista de tarefas já filtrada por projeto: por prioridade e por urgência de prazo.
 * Reaproveita `groupTasksByAgendaBucket`/`AGENDA_BUCKET_LABELS` (mesma classificação da aba
 * Lista) e os rótulos de `TaskPriorityField.tsx` — sem lógica de agrupamento nova.
 *
 * Feature 082: o painel "Por prioridade" perdeu o texto das faixas (só a bandeirinha diz qual é) e
 * ganhou reordenação manual por arraste dentro da faixa; soltar numa faixa vizinha muda a
 * prioridade além de posicionar. O painel "Por prazo" ficou como estava, de propósito.
 */
export function TaskQuadrant({
  tasks,
  todayIso,
  onSelectTask,
  onReorder,
  onPriorityChange,
}: {
  tasks: Task[];
  todayIso: string;
  onSelectTask: (task: Task) => void;
  /** Recebe a faixa afetada inteira, renumerada de 0..n-1. Ausente = painel só de leitura. */
  onReorder?: (pairs: TaskSortOrderPair[]) => void;
  /** Chamado junto de `onReorder` quando a tarefa foi solta numa faixa diferente da dela. */
  onPriorityChange?: (taskId: string, priority: TaskPriority | null) => void;
}) {
  const byPriority = useMemo(() => groupTasksByPriority(tasks), [tasks]);
  const byBucket = useMemo(() => groupTasksByAgendaBucket(tasks, todayIso), [tasks, todayIso]);
  const [draggingTask, setDraggingTask] = useState<Task | null>(null);
  const announcements = useMemo(() => buildQuadrantAnnouncements(byPriority), [byPriority]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      // Só Espaço pega/solta: `Enter` fica reservado para o `onClick` da linha, que abre a tarefa.
      // Com o padrão do @dnd-kit (Espaço **e** Enter) não sobraria tecla para abrir.
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] },
    }),
  );

  const draggable = Boolean(onReorder);

  function handleDragStart(event: DragStartEvent) {
    setDraggingTask(tasks.find((task) => task.id === String(event.active.id)) ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setDraggingTask(null);
    const { active, over } = event;
    if (!over || !onReorder) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    const dragged = tasks.find((task) => task.id === activeId);
    if (!dragged) return;

    const overTask = tasks.find((task) => task.id === overId) ?? null;
    if (!overTask) return;
    const targetBand = bandOf(overTask);

    const sourceBand = bandOf(dragged);
    if (targetBand === sourceBand) {
      const pairs = reorderWithinBand(byPriority[sourceBand], activeId, overId);
      if (pairs.length > 0) onReorder(pairs);
      return;
    }

    // Entre faixas: posiciona **e** muda a prioridade. A ordem importa — a mudança de prioridade
    // vai primeiro para que quem escuta já enxergue a tarefa na faixa nova ao aplicar os pares.
    const pairs = reorderIntoBand(byPriority[targetBand], dragged, overId);
    onPriorityChange?.(activeId, priorityOfBand(targetBand));
    onReorder(pairs);
  }

  if (tasks.length === 0) return null;

  const priorityPanel = (
    <div className="space-y-2 rounded-lg border bg-card p-3">
      <h4 className="text-xs font-semibold text-muted-foreground">Por prioridade</h4>
      <div className="space-y-2">
        {PRIORITY_ORDER.filter((p) => byPriority[p].length > 0).map((p) => (
          <div key={p}>
            {/* Feature 082: o cabeçalho da faixa é só bandeirinha + contagem — o texto ("Alta",
                "Média", "Baixa", "Sem prioridade") saiu da tela. O rótulo por extenso continua
                disponível como `title` (tooltip) aqui e como `aria-label` da própria bandeirinha
                (variante "band"), que é quem carrega o nome acessível da faixa — duplicar o
                `aria-label` no wrapper só faria o leitor de tela repetir o mesmo rótulo. */}
            <div
              className="flex items-center gap-1.5 text-[11px] font-medium"
              title={priorityLabel(priorityOfBand(p))}
            >
              <TaskPriorityFlag priority={priorityOfBand(p)} variant="band" />
              <Badge variant="outline" className="text-[10px]">
                {byPriority[p].length}
              </Badge>
            </div>
            <SortableContext
              items={byPriority[p].map((task) => task.id)}
              strategy={verticalListSortingStrategy}
            >
              <div>
                {byPriority[p].map((task) =>
                  draggable ? (
                    <SortableQuadrantTaskRow
                      key={task.id}
                      task={task}
                      onSelect={() => onSelectTask(task)}
                    />
                  ) : (
                    <QuadrantTaskRow
                      key={task.id}
                      task={task}
                      onSelect={() => onSelectTask(task)}
                    />
                  ),
                )}
              </div>
            </SortableContext>
          </div>
        ))}
      </div>
    </div>
  );

  const duePanel = (
    <div className="space-y-2 rounded-lg border bg-card p-3">
      <h4 className="text-xs font-semibold text-muted-foreground">Por prazo</h4>
      <div className="space-y-2">
        {AGENDA_BUCKET_ORDER.filter((bucket) => byBucket[bucket].length > 0).map((bucket) => (
          <div key={bucket}>
            <div className="flex items-center gap-1.5 text-[11px] font-medium">
              {AGENDA_BUCKET_LABELS[bucket]}
              <Badge variant="outline" className="text-[10px]">
                {byBucket[bucket].length}
              </Badge>
            </div>
            <div>
              {byBucket[bucket].map((task) => (
                <QuadrantTaskRow key={task.id} task={task} onSelect={() => onSelectTask(task)} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDraggingTask(null)}
      accessibility={{ announcements, screenReaderInstructions: SCREEN_READER_INSTRUCTIONS }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {priorityPanel}
        {duePanel}
      </div>
      <DragOverlay>
        {draggingTask ? (
          <div className="rounded-md border bg-card px-1.5 py-1 text-xs shadow-lg">
            {draggingTask.title}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
