export type HabitFrequency = "daily" | "weekly";

/** build = criar rotina; avoid = anti-hábito (dia limpo). */
export type HabitKind = "build" | "avoid";

export interface Habit {
  id: string;
  user_id?: string;
  name: string;
  description?: string | null;
  frequency: HabitFrequency;
  target_per_week: number;
  kind?: HabitKind;
  goal_id?: string | null;
  /** Quanto somar na meta a cada check-in (ex.: 1 livro, 0.5 km). */
  goal_increment?: number | null;
  color?: string | null;
  created_at?: string;
}

export interface HabitLog {
  id: string;
  habit_id: string;
  date: string;
  completed: boolean;
  created_at?: string;
}

export type HabitCreateRequest = Omit<Habit, "id" | "user_id" | "created_at">;

export type HabitUpdateRequest = Partial<HabitCreateRequest> & { id: string };

export interface HabitWithStats extends Habit {
  streak: number;
  completedToday: boolean;
  weekProgress: number;
}

export type WeekStripDay = {
  date: string;
  /** Inicial do dia da semana (D S T Q Q S S). */
  label: string;
  completed: boolean;
  isToday: boolean;
};

/** Célula do heatmap mensal (hábito ou geral). */
export type HabitHeatCellStatus =
  | "future"
  | "empty"
  | "missed"
  | "done"
  | "partial"
  | "today";

export type HabitHeatCell = {
  date: string;
  dayOfMonth: number;
  status: HabitHeatCellStatus;
  /** Taxa 0–1 no heatmap geral; 0 ou 1 no por hábito. */
  rate: number;
  done: number;
  total: number;
};

export type MonthHeatmap = {
  year: number;
  /** 1–12 */
  month: number;
  /** Grade Seg→Dom; `null` = padding fora do mês. */
  cells: (HabitHeatCell | null)[];
  /** Dias passados+hoje com 100% (ou check-in no por hábito). */
  successDays: number;
  /** Dias do mês até hoje (inclusive) que contam para taxa. */
  trackedDays: number;
};
