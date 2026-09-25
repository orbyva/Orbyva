import { completeTaskApi, createTaskApi } from "@/api/tasks/tasks";
import { getTodayIso } from "@/domain/habits";
import { computeAdherence, type AdherenceSummary } from "@/domain/health/adherence";
import {
  computeMissingDoses,
  computeStaleDoses,
  formatDoseTitle,
  medicationTimes,
  MEDICATION_TASK_ICON_KEY,
} from "@/domain/health/medication";
import { getCurrentUserId } from "@/lib/auth-user";
import { supabase } from "@/lib/supabase";
import type {
  HealthHabitToday,
  HealthMetric,
  HealthMetricCreateRequest,
  Medication,
  MedicationCreateRequest,
  MedicationUpdateRequest,
  MetricType,
  ReminderEntityType,
  ReminderFrequency,
  ReminderPreference,
} from "@/types/health";
import type { Habit } from "@/types/habits";
import type { Task } from "@/types/tasks";

const DOSE_SELECT =
  "id, title, description, status, due_date, due_time, completed_at, parent_task_id, project_id, medication_id, dose_time, is_medication, is_consultation";

function isMissingMedicationRelation(message: string): boolean {
  return /medication|dose_time|does not exist|schema cache/i.test(message);
}

async function fetchNextPendingTask(
  userId: string,
  flag: "is_medication" | "is_consultation",
  today: string
): Promise<Task | null> {
  const { data, error } = await supabase
    .from("task")
    .select(DOSE_SELECT)
    .eq("user_id", userId)
    .eq(flag, true)
    .eq("status", "todo")
    .gte("due_date", today)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("due_time", { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Task | null) ?? null;
}

export async function fetchMedications(activeOnly = false): Promise<Medication[]> {
  const userId = await getCurrentUserId();
  let query = supabase
    .from("medication")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (activeOnly) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) {
    if (isMissingMedicationRelation(error.message)) return [];
    throw new Error(error.message);
  }
  return (data ?? []) as Medication[];
}

export async function fetchDosesSince(since: string): Promise<Task[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("task")
    .select(DOSE_SELECT)
    .eq("user_id", userId)
    .not("medication_id", "is", null)
    .gte("due_date", since)
    .order("due_date", { ascending: true, nullsFirst: false });
  if (error) {
    if (isMissingMedicationRelation(error.message)) return [];
    throw new Error(error.message);
  }
  return (data ?? []) as Task[];
}

export type HealthHome = {
  nextMedicationDose: Task | null;
  nextConsultation: Task | null;
  medications: Medication[];
  adherence: AdherenceSummary;
  doses: Task[];
  metrics: HealthMetric[];
  reminders: ReminderPreference[];
  healthHabits: HealthHabitToday[];
};

export async function fetchHealthHabitsToday(): Promise<HealthHabitToday[]> {
  const userId = await getCurrentUserId();
  const today = getTodayIso();
  const { data, error } = await supabase
    .from("habit")
    .select("*")
    .eq("user_id", userId)
    .eq("is_health", true)
    .order("created_at", { ascending: true });
  if (error) {
    if (/is_health/i.test(error.message)) return [];
    throw new Error(error.message);
  }
  const habits = (data ?? []) as Habit[];
  if (habits.length === 0) return [];
  const { data: logs, error: logsError } = await supabase
    .from("habit_log")
    .select("habit_id, completed")
    .in(
      "habit_id",
      habits.map((habit) => habit.id)
    )
    .eq("date", today);
  if (logsError) throw new Error(logsError.message);
  const doneIds = new Set(
    (logs ?? [])
      .filter((log: { completed: boolean }) => log.completed)
      .map((log: { habit_id: string }) => log.habit_id)
  );
  return habits.map((habit) => ({
    habit,
    doneToday: doneIds.has(habit.id),
  }));
}

export async function loadHealthHome(): Promise<HealthHome> {
  const userId = await getCurrentUserId();
  const today = getTodayIso();
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - 30);
  const since = getTodayIso(windowStart);

  const [
    nextMedicationDose,
    nextConsultation,
    medications,
    doses,
    metrics,
    reminders,
    healthHabits,
  ] = await Promise.all([
    fetchNextPendingTask(userId, "is_medication", today),
    fetchNextPendingTask(userId, "is_consultation", today),
    fetchMedications(),
    fetchDosesSince(since),
    fetchHealthMetrics(),
    fetchReminderPreferences(),
    fetchHealthHabitsToday(),
  ]);

  return {
    nextMedicationDose,
    nextConsultation,
    medications,
    adherence: computeAdherence(doses),
    doses,
    metrics,
    reminders,
    healthHabits,
  };
}

export async function markDoseTaken(taskId: string): Promise<void> {
  await completeTaskApi(taskId);
}

export async function fetchMedicationById(id: string): Promise<Medication | null> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("medication")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    if (isMissingMedicationRelation(error.message)) return null;
    throw new Error(error.message);
  }
  return (data as Medication | null) ?? null;
}

async function fetchMedicationDoses(medicationId: string): Promise<Task[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("task")
    .select(DOSE_SELECT)
    .eq("user_id", userId)
    .eq("medication_id", medicationId)
    .order("due_date", { ascending: true, nullsFirst: false });
  if (error) {
    if (isMissingMedicationRelation(error.message)) return [];
    throw new Error(error.message);
  }
  return (data ?? []) as Task[];
}

async function materializeMedicationDoses(
  medication: Medication,
  existingDoses: Task[],
  userId: string
): Promise<void> {
  const missing = computeMissingDoses(medication, existingDoses, getTodayIso());
  if (missing.length === 0) return;
  const title = formatDoseTitle(medication);
  const rows = missing.map((slot) => ({
    user_id: userId,
    project_id: null,
    parent_task_id: null,
    title,
    description: medication.instructions ?? null,
    status: "todo",
    due_date: slot.date,
    due_time: slot.time,
    dose_time: slot.time,
    recurrence_rule: null,
    recurrence_origin_id: null,
    is_medication: true,
    is_quick: true,
    icon_key: MEDICATION_TASK_ICON_KEY,
    medication_id: medication.id,
  }));
  const { error } = await supabase
    .from("task")
    .upsert(rows, { ignoreDuplicates: true });
  if (error) throw new Error(error.message);
}

export async function createMedicationWithDoses(
  input: MedicationCreateRequest
): Promise<Medication> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("medication")
    .insert([
      {
        user_id: userId,
        name: input.name.trim(),
        dose_amount: input.dose_amount ?? null,
        dose_unit: input.dose_unit?.trim() ? input.dose_unit.trim() : null,
        instructions: input.instructions?.trim()
          ? input.instructions.trim()
          : null,
        times: medicationTimes({ times: input.times }),
        interval_days: Math.max(1, Math.trunc(input.interval_days || 1)),
        started_on: input.started_on,
        ended_on: input.ended_on ?? null,
        active: input.active ?? true,
      },
    ])
    .select()
    .single();
  if (error) throw new Error(error.message);
  const medication = data as Medication;
  try {
    await materializeMedicationDoses(medication, [], userId);
  } catch (err) {
    console.error("Falha ao materializar as doses da medicação:", err);
  }
  return medication;
}

export async function updateMedication(
  input: MedicationUpdateRequest
): Promise<void> {
  const userId = await getCurrentUserId();
  const { id, ...fields } = input;
  const payload: Record<string, unknown> = { ...fields };
  if (fields.name != null) payload.name = fields.name.trim();
  if (fields.times != null) payload.times = medicationTimes({ times: fields.times });
  if (fields.interval_days != null) {
    payload.interval_days = Math.max(1, Math.trunc(fields.interval_days || 1));
  }
  const { error } = await supabase
    .from("medication")
    .update(payload)
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);

  const { data: medication, error: readError } = await supabase
    .from("medication")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!medication) return;

  const doses = await fetchMedicationDoses(id);
  const stale = computeStaleDoses(
    medication as Medication,
    doses.map((dose) => ({
      id: dose.id,
      due_date: dose.due_date,
      dose_time: dose.dose_time,
      status: dose.status,
      completed_at: dose.completed_at,
    })),
    getTodayIso()
  );
  if (stale.length > 0) {
    const { error: delError } = await supabase
      .from("task")
      .delete()
      .in("id", stale)
      .eq("user_id", userId);
    if (delError) throw new Error(delError.message);
  }
  try {
    await materializeMedicationDoses(medication as Medication, doses, userId);
  } catch (err) {
    console.error("Falha ao materializar doses após editar:", err);
  }
}

export async function deactivateMedication(id: string): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("medication")
    .update({ active: false })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);

  const today = getTodayIso();
  const { error: delError } = await supabase
    .from("task")
    .delete()
    .eq("user_id", userId)
    .eq("medication_id", id)
    .eq("status", "todo")
    .gte("due_date", today);
  if (delError && !isMissingMedicationRelation(delError.message)) {
    throw new Error(delError.message);
  }
}

export async function reactivateMedication(id: string): Promise<void> {
  const userId = await getCurrentUserId();
  const { data: current, error: readError } = await supabase
    .from("medication")
    .select("ended_on")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  const endedOn = (current?.ended_on ?? null) as string | null;
  const today = getTodayIso();
  const payload: Record<string, unknown> = { active: true };
  if (endedOn != null && endedOn <= today) payload.ended_on = null;
  const { error } = await supabase
    .from("medication")
    .update(payload)
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const medication = await fetchMedicationById(id);
  if (medication) {
    try {
      await materializeMedicationDoses(medication, [], userId);
    } catch (err) {
      console.error("Falha ao materializar doses ao reativar:", err);
    }
  }
}

export async function createConsultation(input: {
  title: string;
  due_date: string;
  due_time?: string | null;
  description?: string;
}): Promise<Task> {
  return createTaskApi({
    title: input.title.trim(),
    due_date: input.due_date,
    due_time: input.due_time ?? null,
    description: input.description,
    is_consultation: true,
  });
}

function isMissingHealthRelation(message: string): boolean {
  return /health_metric|reminder_preference|does not exist|schema cache/i.test(
    message
  );
}

export async function fetchHealthMetrics(
  type?: MetricType
): Promise<HealthMetric[]> {
  const userId = await getCurrentUserId();
  let query = supabase
    .from("health_metric")
    .select("*")
    .eq("user_id", userId)
    .order("recorded_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(120);
  if (type) query = query.eq("metric_type", type);
  const { data, error } = await query;
  if (error) {
    if (isMissingHealthRelation(error.message)) return [];
    throw new Error(error.message);
  }
  return (data ?? []) as HealthMetric[];
}

export async function recordHealthMetric(
  input: HealthMetricCreateRequest
): Promise<HealthMetric> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("health_metric")
    .insert([
      {
        user_id: userId,
        metric_type: input.metric_type,
        value: input.value,
        recorded_date: input.recorded_date,
        notes: input.notes?.trim() ? input.notes.trim() : null,
      },
    ])
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as HealthMetric;
}

export async function fetchReminderPreferences(): Promise<ReminderPreference[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("reminder_preference")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) {
    if (isMissingHealthRelation(error.message)) return [];
    throw new Error(error.message);
  }
  return (data ?? []) as ReminderPreference[];
}

export async function upsertReminderPreference(
  entityType: ReminderEntityType,
  patch: {
    frequency?: ReminderFrequency;
    time_of_day?: string | null;
    enabled?: boolean;
  }
): Promise<ReminderPreference> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("reminder_preference")
    .upsert(
      [{ user_id: userId, entity_type: entityType, ...patch }],
      { onConflict: "user_id,entity_type" }
    )
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as ReminderPreference;
}
