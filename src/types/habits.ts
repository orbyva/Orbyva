export type HabitFrequency = "daily" | "weekly";

export interface Habit {
  id: string;
  user_id?: string;
  name: string;
  description?: string | null;
  frequency: HabitFrequency;
  target_per_week: number;
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
