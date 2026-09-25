import type {
  Habit,
  HabitHeatCell,
  HabitLog,
  MonthHeatmap,
} from "@/types/habits";

function todayIso(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
const WEEKDAY_HEADERS = ["S", "T", "Q", "Q", "S", "S", "D"] as const;

export function monthHeatmapHeaders(): readonly string[] {
  return WEEKDAY_HEADERS;
}

export function shiftMonth(
  year: number,
  month: number,
  delta: number
): { year: number; month: number } {
  const d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export function monthLabel(year: number, month: number): string {
  const raw = new Date(year, month - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function isoFor(year: number, month: number, day: number): string {
  const m = String(month).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

/** Segunda = 0 … Domingo = 6 (igual à week strip). */
function mondayIndex(year: number, month: number, day: number): number {
  const dow = new Date(year, month - 1, day, 12, 0, 0).getDay();
  return (dow + 6) % 7;
}

function completedSet(logs: HabitLog[]): Set<string> {
  const set = new Set<string>();
  for (const log of logs) {
    if (log.completed) set.add(log.date);
  }
  return set;
}

function padMonthGrid(
  year: number,
  month: number,
  buildDay: (day: number, iso: string) => HabitHeatCell
): (HabitHeatCell | null)[] {
  const totalDays = daysInMonth(year, month);
  const lead = mondayIndex(year, month, 1);
  const cells: (HabitHeatCell | null)[] = Array.from({ length: lead }, () => null);

  for (let day = 1; day <= totalDays; day++) {
    cells.push(buildDay(day, isoFor(year, month, day)));
  }

  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function summarize(
  cells: (HabitHeatCell | null)[],
  year: number,
  month: number
): MonthHeatmap {
  let successDays = 0;
  let trackedDays = 0;
  for (const cell of cells) {
    if (!cell) continue;
    if (cell.status === "future") continue;
    if (cell.total <= 0) continue;
    trackedDays++;
    if (cell.rate >= 1) successDays++;
  }
  return { year, month, cells, successDays, trackedDays };
}

/**
 * Heatmap de um hábito no mês.
 * Diário: passado sem check-in = missed. Semanal: vazio neutro (não marca falha).
 */
export function buildHabitMonthHeatmap(
  logs: HabitLog[],
  year: number,
  month: number,
  opts: {
    today?: string;
    /** true = diário (vazio no passado = falha). */
    markMissed: boolean;
  }
): MonthHeatmap {
  const today = opts.today ?? todayIso();
  const done = completedSet(logs);

  const cells = padMonthGrid(year, month, (dayOfMonth, date) => {
    if (date > today) {
      return {
        date,
        dayOfMonth,
        status: "future",
        rate: 0,
        done: 0,
        total: 1,
      };
    }

    const isDone = done.has(date);
    if (isDone) {
      return {
        date,
        dayOfMonth,
        status: date === today ? "today" : "done",
        rate: 1,
        done: 1,
        total: 1,
      };
    }

    if (date === today) {
      return {
        date,
        dayOfMonth,
        status: "today",
        rate: 0,
        done: 0,
        total: 1,
      };
    }

    if (opts.markMissed) {
      return {
        date,
        dayOfMonth,
        status: "missed",
        rate: 0,
        done: 0,
        total: 1,
      };
    }

    return {
      date,
      dayOfMonth,
      status: "empty",
      rate: 0,
      done: 0,
      total: 1,
    };
  });

  return summarize(cells, year, month);
}

/** Heatmap geral: taxa do dia = hábitos concluídos / total. */
export function buildOverallMonthHeatmap(
  habits: Habit[],
  logs: HabitLog[],
  year: number,
  month: number,
  today = todayIso()
): MonthHeatmap {
  const total = habits.length;
  const doneByDate = new Map<string, number>();

  if (total > 0) {
    for (const log of logs) {
      if (!log.completed) continue;
      doneByDate.set(log.date, (doneByDate.get(log.date) ?? 0) + 1);
    }
  }

  const cells = padMonthGrid(year, month, (dayOfMonth, date) => {
    if (total === 0) {
      return {
        date,
        dayOfMonth,
        status: date > today ? "future" : date === today ? "today" : "empty",
        rate: 0,
        done: 0,
        total: 0,
      };
    }

    if (date > today) {
      return {
        date,
        dayOfMonth,
        status: "future",
        rate: 0,
        done: 0,
        total,
      };
    }

    const done = Math.min(total, doneByDate.get(date) ?? 0);
    const rate = done / total;

    if (date === today) {
      return {
        date,
        dayOfMonth,
        status: "today",
        rate,
        done,
        total,
      };
    }

    if (done === 0) {
      return {
        date,
        dayOfMonth,
        status: "missed",
        rate: 0,
        done: 0,
        total,
      };
    }

    if (rate >= 1) {
      return {
        date,
        dayOfMonth,
        status: "done",
        rate: 1,
        done,
        total,
      };
    }

    return {
      date,
      dayOfMonth,
      status: "partial",
      rate,
      done,
      total,
    };
  });

  return summarize(cells, year, month);
}

export function heatmapRateLabel(map: MonthHeatmap): string {
  if (map.trackedDays === 0) return "Sem dias no mês ainda";
  const pct = Math.round((map.successDays / map.trackedDays) * 100);
  return `${map.successDays}/${map.trackedDays} dias · ${pct}%`;
}
