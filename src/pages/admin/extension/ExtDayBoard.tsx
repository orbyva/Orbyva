import { Check, CheckSquare, Pill } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  medicationDoseWhen,
  type DayTaskBucket,
} from "@/domain/extension/dayBoard";
import type { Project, Task } from "@/types/tasks";

type CounterChip = {
  href: string;
  value: number;
  label: string;
  tone?: "rose" | "default";
};

function ExtCounters({ chips }: { chips: CounterChip[] }) {
  return (
    <section className="flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <a
          key={`${chip.href}-${chip.label}`}
          href={chip.href}
          target="_blank"
          rel="noreferrer"
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] tabular-nums hover:bg-muted/70",
            chip.tone === "rose"
              ? "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300"
              : "border-border bg-card text-muted-foreground hover:text-foreground"
          )}
        >
          <span className="font-semibold text-foreground">{chip.value}</span>
          {chip.label}
        </a>
      ))}
    </section>
  );
}

type ExtDayBoardProps = {
  overdueCount: number;
  todayCount: number;
  shoppingPending: number;
  linksPending: number;
  habitsPending: number;
  loading: boolean;
  items: Array<{ task: Task; bucket: DayTaskBucket }>;
  hidden: number;
  taskTitle: string;
  creating: boolean;
  hasPageLink: boolean;
  projects: Project[];
  projectId: string | null;
  nextDose: Task | null;
  today: string;
  onTaskTitleChange: (value: string) => void;
  onProjectChange: (value: string | null) => void;
  onCreateTask: () => void;
  onCompleteTask: (taskId: string) => void;
  onTakeDose: (taskId: string) => void;
};

export function ExtDayBoard({
  overdueCount,
  todayCount,
  shoppingPending,
  linksPending,
  habitsPending,
  loading,
  items,
  hidden,
  taskTitle,
  creating,
  hasPageLink,
  projects,
  projectId,
  nextDose,
  today,
  onTaskTitleChange,
  onProjectChange,
  onCreateTask,
  onCompleteTask,
  onTakeDose,
}: ExtDayBoardProps) {
  return (
    <>
      <ExtCounters
        chips={[
          ...(overdueCount > 0
            ? [
                {
                  href: "/tasks",
                  value: overdueCount,
                  label: overdueCount === 1 ? "atrasada" : "atrasadas",
                  tone: "rose" as const,
                },
              ]
            : []),
          {
            href: "/tasks",
            value: todayCount,
            label: "hoje",
          },
          {
            href: "/shopping-list",
            value: shoppingPending,
            label: shoppingPending === 1 ? "compra" : "compras",
          },
          {
            href: "/links",
            value: linksPending,
            label: linksPending === 1 ? "link" : "links",
          },
          {
            href: "/habits",
            value: habitsPending,
            label: habitsPending === 1 ? "hábito" : "hábitos",
          },
        ]}
      />

      {nextDose ? (
        <section className="rounded-xl border bg-card p-3 shadow-sm">
          <div className="flex items-center gap-2">
            <Pill className="size-4 text-primary" />
            <p className="text-sm font-semibold">Próxima dose</p>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{nextDose.title}</p>
              <p className="text-[11px] tabular-nums text-muted-foreground">
                {medicationDoseWhen(nextDose, today)}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              className="h-8 shrink-0"
              onClick={() => onTakeDose(nextDose.id)}
            >
              Tomada
            </Button>
          </div>
        </section>
      ) : null}

      <section className="rounded-xl border bg-card p-3 shadow-sm">
        <div className="flex items-center gap-2">
          <CheckSquare className="size-4 text-primary" />
          <p className="text-sm font-semibold">Tarefas</p>
        </div>
        {loading && items.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">Carregando…</p>
        ) : items.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Nada atrasado nem para hoje.{" "}
            <a
              href="/tasks"
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              Ver todas
            </a>
          </p>
        ) : (
          <ul className="mt-2 space-y-1">
            {items.map(({ task, bucket }) => (
              <li key={task.id}>
                <button
                  type="button"
                  onClick={() => onCompleteTask(task.id)}
                  className="flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left text-sm hover:bg-muted/70"
                >
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-emerald-300 text-emerald-600">
                    <Check className="size-3.5 text-transparent" />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{task.title}</span>
                  <span
                    className={cn(
                      "shrink-0 text-[10px] font-medium uppercase tracking-wide",
                      bucket === "overdue"
                        ? "text-rose-600 dark:text-rose-400"
                        : "text-muted-foreground"
                    )}
                  >
                    {bucket === "overdue" ? "atrasada" : "hoje"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {hidden > 0 ? (
          <a
            href="/tasks"
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block text-[11px] text-primary hover:underline"
          >
            +{hidden} no app
          </a>
        ) : null}
        <form
          className="mt-2 flex gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            onCreateTask();
          }}
        >
          <Input
            value={taskTitle}
            onChange={(event) => onTaskTitleChange(event.target.value)}
            placeholder="Nova tarefa"
            aria-label="Título da nova tarefa"
            className="h-8 text-sm"
          />
          <Button type="submit" size="sm" className="h-8 shrink-0" disabled={creating}>
            {creating ? "…" : "Criar"}
          </Button>
        </form>
        {projects.length > 0 ? (
          <label className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="shrink-0">Projeto</span>
            <select
              aria-label="Projeto da tarefa"
              value={projectId ?? ""}
              onChange={(event) =>
                onProjectChange(event.target.value ? event.target.value : null)
              }
              className="h-7 min-w-0 flex-1 rounded-md border bg-background px-1.5 text-xs text-foreground"
            >
              <option value="">Sem projeto</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {hasPageLink ? (
          <p className="mt-1 text-[11px] text-muted-foreground">
            O link desta aba entra na tarefa.
          </p>
        ) : null}
      </section>
    </>
  );
}
