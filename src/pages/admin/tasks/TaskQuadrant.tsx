import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { formatDateTimeBR } from "@/lib/currency";
import { cn } from "@/lib/utils";
import {
  AGENDA_BUCKET_LABELS,
  AGENDA_BUCKET_ORDER,
  groupTasksByAgendaBucket,
} from "@/domain/tasks/agenda";
import { PRIORITY_LABELS } from "@/domain/tasks/priority";
import { TaskPriorityFlag } from "./TaskPriorityField";
import type { Task, TaskPriority } from "@/types/tasks";

type PriorityKey = TaskPriority | "none";

const PRIORITY_ORDER: PriorityKey[] = ["high", "medium", "low", "none"];

function groupTasksByPriority(tasks: Task[]): Record<PriorityKey, Task[]> {
  const groups: Record<PriorityKey, Task[]> = { high: [], medium: [], low: [], none: [] };
  for (const task of tasks) {
    groups[task.priority ?? "none"].push(task);
  }
  return groups;
}

function QuadrantTaskRow({ task, onSelect }: { task: Task; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs hover:bg-muted"
    >
      <TaskPriorityFlag priority={task.priority} />
      <span className={cn("min-w-0 flex-1 truncate", task.status === "done" && "text-muted-foreground line-through")}>
        {task.title}
      </span>
      {task.due_date && (
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {formatDateTimeBR(task.due_date, task.due_time)}
        </span>
      )}
    </button>
  );
}

/**
 * "Quadrante" de um projeto selecionado (`projectFilter` específico) — combina duas visões da
 * mesma lista de tarefas já filtrada por projeto: por prioridade e por urgência de prazo.
 * Reaproveita `groupTasksByAgendaBucket`/`AGENDA_BUCKET_LABELS` (mesma classificação da aba
 * Lista) e os rótulos de `TaskPriorityField.tsx` — sem lógica de agrupamento nova.
 */
export function TaskQuadrant({
  tasks,
  todayIso,
  onSelectTask,
}: {
  tasks: Task[];
  todayIso: string;
  onSelectTask: (task: Task) => void;
}) {
  const byPriority = useMemo(() => groupTasksByPriority(tasks), [tasks]);
  const byBucket = useMemo(() => groupTasksByAgendaBucket(tasks, todayIso), [tasks, todayIso]);

  if (tasks.length === 0) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-2 rounded-lg border bg-card p-3">
        <h4 className="text-xs font-semibold text-muted-foreground">Por prioridade</h4>
        <div className="space-y-2">
          {PRIORITY_ORDER.filter((p) => byPriority[p].length > 0).map((p) => (
            <div key={p}>
              <div className="flex items-center gap-1.5 text-[11px] font-medium">
                {p !== "none" && <TaskPriorityFlag priority={p} />}
                {p === "none" ? "Sem prioridade" : PRIORITY_LABELS[p]}
                <Badge variant="outline" className="text-[10px]">
                  {byPriority[p].length}
                </Badge>
              </div>
              <div>
                {byPriority[p].map((task) => (
                  <QuadrantTaskRow key={task.id} task={task} onSelect={() => onSelectTask(task)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

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
    </div>
  );
}
