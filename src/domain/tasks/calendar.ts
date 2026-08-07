import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  format,
  startOfMonth,
  subDays,
} from "date-fns";

interface CalendarTask {
  id: string;
  due_date: string | null;
  due_time?: string | null;
}

interface CalendarEvent {
  id: string;
  starts_at: string;
}

export type CalendarItem<T extends CalendarTask = CalendarTask, E extends CalendarEvent = CalendarEvent> =
  | { kind: "task"; task: T }
  | { kind: "event"; event: E };

/** Grade de semanas completas (dom→sáb) cobrindo o mês inteiro, com folga do mês anterior/seguinte. */
export function computeMonthGridDays(monthDate: Date): Date[] {
  const start = startOfMonth(monthDate);
  const end = endOfMonth(monthDate);
  const gridStart = subDays(start, start.getDay());
  const gridEnd = addDays(end, 6 - end.getDay());
  return eachDayOfInterval({ start: gridStart, end: gridEnd });
}

function calendarItemTime<T extends CalendarTask, E extends CalendarEvent>(
  item: CalendarItem<T, E>
): string {
  if (item.kind === "task") return item.task.due_time ?? "99:99";
  return format(new Date(item.event.starts_at), "HH:mm");
}

/**
 * Agrupa tarefas (por `due_date`) e eventos de projeto (por `starts_at`, convertido pro dia local
 * — nunca fatia a string ISO crua, que é UTC) num mapa por dia (`yyyy-MM-dd`), cada lista ordenada
 * por horário (tarefas sem `due_time` vão por último). Espera receber listas já filtradas
 * (tarefas de topo, projeto selecionado etc.) — não filtra nada sozinho.
 */
export function groupCalendarItemsByDay<T extends CalendarTask, E extends CalendarEvent>(
  tasks: T[],
  events: E[]
): Map<string, CalendarItem<T, E>[]> {
  const map = new Map<string, CalendarItem<T, E>[]>();

  function push(dayKey: string, item: CalendarItem<T, E>) {
    const list = map.get(dayKey);
    if (list) list.push(item);
    else map.set(dayKey, [item]);
  }

  for (const task of tasks) {
    if (!task.due_date) continue;
    push(task.due_date, { kind: "task", task });
  }
  for (const event of events) {
    const dayKey = format(new Date(event.starts_at), "yyyy-MM-dd");
    push(dayKey, { kind: "event", event });
  }
  for (const list of map.values()) {
    list.sort((a, b) => calendarItemTime(a).localeCompare(calendarItemTime(b)));
  }
  return map;
}
