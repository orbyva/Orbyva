import { formatLocalIsoDate } from "@/lib/dates";
import type { ProjectEvent, Task } from "@/types/tasks";

export type CalendarItem =
  | { kind: "task"; task: Task }
  | { kind: "event"; event: ProjectEvent };

export type MonthGridDay = {
  iso: string;
  day: number;
  inMonth: boolean;
};

export function computeMonthGridDays(year: number, month: number): MonthGridDay[] {
  const first = new Date(year, month - 1, 1);
  const lead = first.getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const prevDays = new Date(year, month - 1, 0).getDate();
  const cells: MonthGridDay[] = [];

  for (let i = lead - 1; i >= 0; i--) {
    const day = prevDays - i;
    const date = new Date(year, month - 2, day);
    cells.push({ iso: formatLocalIsoDate(date), day, inMonth: false });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({
      iso: formatLocalIsoDate(new Date(year, month - 1, day)),
      day,
      inMonth: true,
    });
  }
  while (cells.length % 7 !== 0) {
    const nextDay = cells.length - (lead + daysInMonth) + 1;
    const date = new Date(year, month, nextDay);
    cells.push({
      iso: formatLocalIsoDate(date),
      day: nextDay,
      inMonth: false,
    });
  }
  return cells;
}

function itemTime(item: CalendarItem): string {
  if (item.kind === "task") return item.task.due_time?.slice(0, 5) ?? "99:99";
  const date = new Date(item.event.starts_at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function groupCalendarItemsByDay(
  tasks: Task[],
  events: ProjectEvent[]
): Map<string, CalendarItem[]> {
  const map = new Map<string, CalendarItem[]>();
  function push(iso: string, item: CalendarItem) {
    const list = map.get(iso);
    if (list) list.push(item);
    else map.set(iso, [item]);
  }
  for (const task of tasks) {
    if (!task.due_date) continue;
    push(task.due_date.slice(0, 10), { kind: "task", task });
  }
  for (const event of events) {
    push(formatLocalIsoDate(new Date(event.starts_at)), {
      kind: "event",
      event,
    });
  }
  for (const list of map.values()) {
    list.sort((a, b) => itemTime(a).localeCompare(itemTime(b)));
  }
  return map;
}

export function monthTitle(year: number, month: number): string {
  const raw = new Date(year, month - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export const WEEKDAY_HEADERS = ["D", "S", "T", "Q", "Q", "S", "S"] as const;

export const TASK_STATUS_COLORS: Record<string, string> = {
  todo: "#64748B",
  doing: "#0EA5E9",
  done: "#16A34A",
};

export const DEFAULT_ITEM_DURATION_MINUTES = 30;
const MINUTES_PER_DAY = 24 * 60;

function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function computeWeekDays(iso: string): string[] {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const start = new Date(date);
  start.setDate(date.getDate() - date.getDay());
  return Array.from({ length: 7 }, (_, index) => {
    const next = new Date(start);
    next.setDate(start.getDate() + index);
    return formatLocalIsoDate(next);
  });
}

export function shiftDays(iso: string, delta: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const next = new Date(year, month - 1, day + delta);
  return formatLocalIsoDate(next);
}

export function weekTitle(iso: string): string {
  const days = computeWeekDays(iso);
  const first = new Date(`${days[0]}T12:00:00`);
  const last = new Date(`${days[6]}T12:00:00`);
  const fmt = (d: Date) =>
    d.toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
  return `${fmt(first)} – ${fmt(last)}`;
}

export function dayTitle(iso: string): string {
  const raw = new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export interface ItemTimeRange {
  startMinutes: number;
  durationMinutes: number;
}

export function getItemTimeRange(item: CalendarItem): ItemTimeRange | null {
  if (item.kind === "task") {
    if (!item.task.due_time) return null;
    const startMinutes = parseTimeToMinutes(item.task.due_time);
    const durationMinutes =
      item.task.estimated_duration && item.task.estimated_duration > 0
        ? item.task.estimated_duration
        : DEFAULT_ITEM_DURATION_MINUTES;
    return { startMinutes, durationMinutes };
  }
  const startDate = new Date(item.event.starts_at);
  const startMinutes = startDate.getHours() * 60 + startDate.getMinutes();
  const durationMinutes = item.event.ends_at
    ? Math.max(
        1,
        Math.round(
          (new Date(item.event.ends_at).getTime() - startDate.getTime()) / 60000
        )
      )
    : DEFAULT_ITEM_DURATION_MINUTES;
  return { startMinutes, durationMinutes };
}

export function isQuickTask(task: Task): boolean {
  return task.is_quick === true;
}

export function splitAgendaItems(items: CalendarItem[]): {
  timed: Array<{ item: CalendarItem; range: ItemTimeRange }>;
  quick: Task[];
  untimed: CalendarItem[];
} {
  const timed: Array<{ item: CalendarItem; range: ItemTimeRange }> = [];
  const quick: Task[] = [];
  const untimed: CalendarItem[] = [];
  for (const item of items) {
    if (item.kind === "task" && isQuickTask(item.task)) {
      quick.push(item.task);
      continue;
    }
    const range = getItemTimeRange(item);
    if (range) timed.push({ item, range });
    else untimed.push(item);
  }
  return { timed, quick, untimed };
}

export function computeItemPosition(range: ItemTimeRange): {
  topPercent: number;
  heightPercent: number;
} {
  const topPercent = (range.startMinutes / MINUTES_PER_DAY) * 100;
  const rawHeightPercent = (range.durationMinutes / MINUTES_PER_DAY) * 100;
  const heightPercent = Math.min(rawHeightPercent, 100 - topPercent);
  return { topPercent, heightPercent };
}

export interface TimedLayoutItem {
  item: CalendarItem;
  range: ItemTimeRange;
  topPercent: number;
  heightPercent: number;
  leftPercent: number;
  widthPercent: number;
}

export function layoutTimedItems(items: CalendarItem[]): {
  timed: TimedLayoutItem[];
  untimed: CalendarItem[];
} {
  const split = splitAgendaItems(items);
  const sorted = [...split.timed].sort(
    (a, b) => a.range.startMinutes - b.range.startMinutes
  );
  const columnEnds: number[] = [];
  const columnIndexByEntry = new Map<(typeof sorted)[number], number>();
  const groupIndexByEntry = new Map<(typeof sorted)[number], number>();
  let currentGroup = -1;
  let groupMaxEnd = -Infinity;
  const groupColumnCount: number[] = [];

  for (const entry of sorted) {
    const end = entry.range.startMinutes + entry.range.durationMinutes;
    if (entry.range.startMinutes >= groupMaxEnd) {
      currentGroup += 1;
      groupColumnCount.push(0);
      columnEnds.length = 0;
      groupMaxEnd = end;
    } else {
      groupMaxEnd = Math.max(groupMaxEnd, end);
    }
    let columnIndex = columnEnds.findIndex((colEnd) => colEnd <= entry.range.startMinutes);
    if (columnIndex === -1) {
      columnIndex = columnEnds.length;
      columnEnds.push(end);
    } else {
      columnEnds[columnIndex] = end;
    }
    columnIndexByEntry.set(entry, columnIndex);
    groupIndexByEntry.set(entry, currentGroup);
    groupColumnCount[currentGroup] = Math.max(
      groupColumnCount[currentGroup],
      columnIndex + 1
    );
  }

  const laidOut = sorted.map((entry) => {
    const { topPercent, heightPercent } = computeItemPosition(entry.range);
    const columnIndex = columnIndexByEntry.get(entry)!;
    const columnCount = groupColumnCount[groupIndexByEntry.get(entry)!];
    const widthPercent = 100 / columnCount;
    return {
      item: entry.item,
      range: entry.range,
      topPercent,
      heightPercent,
      leftPercent: columnIndex * widthPercent,
      widthPercent,
    };
  });

  return { timed: laidOut, untimed: split.untimed };
}

