import type { Habit } from "@/types/habits";

/**
 * Medicação. A dose continua sendo uma `task`
 * (`is_medication`, `medication_id`, `dose_time`).
 */
export interface Medication {
  id: string;
  user_id?: string;
  name: string;
  dose_amount?: number | null;
  dose_unit?: string | null;
  instructions?: string | null;
  times: string[];
  interval_days: number;
  started_on: string;
  ended_on?: string | null;
  active: boolean;
  created_at?: string;
}

export type MedicationCreateRequest = Omit<
  Medication,
  "id" | "user_id" | "created_at" | "active"
> & { active?: boolean };

export type MedicationUpdateRequest = Partial<MedicationCreateRequest> & {
  id: string;
};

export type MetricType = "weight" | "height" | "waist" | "hip" | "chest" | "arm";

export interface HealthMetric {
  id: string;
  user_id?: string;
  metric_type: MetricType;
  value: number;
  recorded_date: string;
  notes?: string | null;
  created_at?: string;
}

export type HealthMetricCreateRequest = Omit<
  HealthMetric,
  "id" | "user_id" | "created_at"
>;

export type ReminderEntityType =
  | "medication"
  | "consultation"
  | "water"
  | "nutrition"
  | "body_metric";

export type ReminderFrequency = "daily" | "weekly" | "monthly";

export interface ReminderPreference {
  id: string;
  user_id?: string;
  entity_type: ReminderEntityType;
  frequency: ReminderFrequency;
  time_of_day: string | null;
  enabled: boolean;
  last_notified_at: string | null;
  created_at?: string;
}

export interface HealthHabitToday {
  habit: Habit;
  doneToday: boolean;
}
