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
