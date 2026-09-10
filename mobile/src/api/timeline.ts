import { fetchRecurringForDashboard } from "@/api/finance/dashboard";
import { fetchTasks } from "@/api/tasks/tasks";
import {
  addDaysIso,
  getTodayIso,
  resolveTimelineStatus,
} from "@/domain/timeline";
import { openTopLevelTasks } from "@/domain/tasks/listView";
import { formatBRL } from "@/lib/currency";
import type { Recurring } from "@/types/recurring";
import type { Task } from "@/types/tasks";
import type { TimelineItem } from "@/types/timeline";

const STATUS_ORDER: Record<TimelineItem["status"], number> = {
  overdue: 0,
  today: 1,
  upcoming: 2,
  completed: 3,
  info: 4,
};

function inWindow(date: string, minIso: string, maxIso: string): boolean {
  return date >= minIso && date <= maxIso;
}

function collectRecurringItems(
  recurring: Recurring[],
  todayIso: string,
  minIso: string,
  maxIso: string
): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const rec of recurring) {
    if (!Array.isArray(rec.installments)) continue;
    const paid = rec.paid_parcels || [];
    for (const installment of rec.installments) {
      if (paid.includes(installment.number)) continue;
      if (!inWindow(installment.dueDate, minIso, maxIso)) continue;
      const overdue = installment.dueDate < todayIso;
      items.push({
        id: `finance-${rec.id}-${installment.number}`,
        date: installment.dueDate,
        module: "finance",
        title: rec.description || rec.class?.name || "Parcela",
        subtitle: `Parcela ${installment.number} · ${formatBRL(Number(rec.value) || 0)}`,
        status: resolveTimelineStatus(installment.dueDate, todayIso, overdue),
        href: "/finance",
      });
    }
  }
  return items;
}

function collectTaskItems(
  tasks: Task[],
  todayIso: string,
  minIso: string,
  maxIso: string
): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const task of openTopLevelTasks(tasks)) {
    if (!task.due_date) continue;
    if (!inWindow(task.due_date, minIso, maxIso)) continue;
    const overdue = task.due_date < todayIso;
    items.push({
      id: `task-${task.id}`,
      date: task.due_date,
      module: "tasks",
      title: task.title,
      subtitle: overdue ? "Tarefa atrasada" : "Tarefa",
      status: resolveTimelineStatus(task.due_date, todayIso, overdue),
      href: "/tasks",
    });
  }
  return items;
}

function sortTimeline(items: TimelineItem[]): TimelineItem[] {
  return [...items].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
  });
}

/** Timeline: parcelas em aberto + tarefas com prazo. */
export async function fetchFinanceTimeline(
  daysAhead = 90,
  daysBehind = 14
): Promise<TimelineItem[]> {
  const [recurring, tasks] = await Promise.all([
    fetchRecurringForDashboard(),
    fetchTasks().catch(() => []),
  ]);
  return assembleFinanceTimeline(recurring, daysAhead, daysBehind, tasks);
}

export function assembleFinanceTimeline(
  recurring: Recurring[],
  daysAhead: number,
  daysBehind: number,
  tasks: Task[] = []
): TimelineItem[] {
  const todayIso = getTodayIso();
  const minIso = addDaysIso(todayIso, -daysBehind);
  const maxIso = addDaysIso(todayIso, daysAhead);
  return sortTimeline([
    ...collectRecurringItems(recurring, todayIso, minIso, maxIso),
    ...collectTaskItems(tasks, todayIso, minIso, maxIso),
  ]);
}
