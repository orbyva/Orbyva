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
  goal_increment?: number | null;
  color?: string | null;
  is_health?: boolean;
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

export type WeekStripDay = {
  date: string;
  label: string;
  completed: boolean;
  isToday: boolean;
};

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
  rate: number;
  done: number;
  total: number;
};

export type MonthHeatmap = {
  year: number;
  month: number;
  cells: (HabitHeatCell | null)[];
  successDays: number;
  trackedDays: number;
};
