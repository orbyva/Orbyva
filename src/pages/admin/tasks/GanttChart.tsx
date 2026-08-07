import { Fragment } from "react";
import { computeGanttBar, computeGanttDays, groupSubtasksByParent } from "@/domain/tasks";
import type { Task, TaskStatus } from "@/types/tasks";
import { cn } from "@/lib/utils";

const STATUS_BAR_CLASS: Record<TaskStatus, string> = {
  todo: "bg-muted-foreground/50",
  doing: "bg-blue-500",
  done: "bg-green-500",
};

const LABEL_COL_PX = 180;
const DAY_COL_PX = 32;

function GanttRow({
  task,
  days,
  indent,
}: {
  task: Task;
  days: string[];
  indent: boolean;
}) {
  const bar = computeGanttBar(task, days);
  return (
    <>
      <div
        className={cn(
          "sticky left-0 z-10 truncate border-b bg-card py-1.5 pr-2 text-xs",
          indent ? "pl-6 text-muted-foreground" : "font-medium"
        )}
        style={{ gridColumn: 1 }}
      >
        {task.title}
      </div>
      <div
        className="relative border-b"
        style={{ gridColumn: `2 / span ${days.length}` }}
      >
        {bar && (
          <div
            className={cn("absolute inset-y-1.5 rounded", STATUS_BAR_CLASS[task.status])}
            style={{
              left: `${(bar.startCol - 1) * DAY_COL_PX}px`,
              width: `${bar.span * DAY_COL_PX - 4}px`,
            }}
            title={task.title}
          />
        )}
      </div>
    </>
  );
}

export function GanttChart({ tasks }: { tasks: Task[] }) {
  const subtasksByParent = groupSubtasksByParent(tasks);
  const topLevel = tasks.filter((t) => !t.parent_task_id);
  const allForRange = tasks;
  const days = computeGanttDays(allForRange);
  const untimedCount = topLevel.filter((t) => !t.start_date && !t.due_date).length;

  if (days.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma tarefa com prazo ou início definido para mostrar no Gantt.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {untimedCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {untimedCount} tarefa(s) sem prazo/início não aparecem aqui.
        </p>
      )}
      <div className="overflow-x-auto rounded-lg border">
        <div
          className="grid"
          style={{
            gridTemplateColumns: `${LABEL_COL_PX}px repeat(${days.length}, ${DAY_COL_PX}px)`,
          }}
        >
          <div className="sticky left-0 z-10 border-b bg-card" style={{ gridColumn: 1 }} />
          {days.map((d, i) => (
            <div
              key={d}
              className="border-b py-1 text-center text-[10px] text-muted-foreground"
              style={{ gridColumn: i + 2 }}
            >
              {d.slice(8, 10)}/{d.slice(5, 7)}
            </div>
          ))}

          {topLevel.map((task) => {
            const subtasks = subtasksByParent.get(task.id) ?? [];
            return (
              <Fragment key={task.id}>
                <GanttRow task={task} days={days} indent={false} />
                {subtasks.map((s) => (
                  <GanttRow key={s.id} task={s} days={days} indent />
                ))}
              </Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
