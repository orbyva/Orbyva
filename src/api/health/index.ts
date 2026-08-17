import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth-user";
import { fetchDosesSince, fetchMedications } from "@/api/health/medications";
import { computeAdherence } from "@/domain/health/adherence";
import { formatLocalIsoDate } from "@/lib/dates";
import type { Habit } from "@/types/habits";
import type {
  HealthHabitToday,
  HealthMetric,
  HealthMetricCreateRequest,
  HealthSummary,
  MetricType,
  ReminderEntityType,
  ReminderFrequency,
  ReminderPreference,
} from "@/types/health";
import type { Task } from "@/types/tasks";

/**
 * Próximo compromisso de saúde pendente de um tipo (`is_medication` na 060, `is_consultation` na
 * 061) — pendente (`status = 'todo'`), agendado de hoje em diante, o primeiro por `due_date` e, no
 * mesmo dia, por `due_time`.
 *
 * Não há tabela de medicação nem de consulta: desde a feature 049 uma medicação é uma tarefa
 * recorrente com `is_medication = true` (cada dose é uma ocorrência materializada), e a 061 fez o
 * mesmo com consultas. Por isso as duas consultas são em `task`, mudando só a flag.
 *
 * `due_time` nulo vai para o fim do dia (`nullsFirst: false`): um compromisso sem horário não deve
 * passar na frente de um marcado para as 8h do mesmo dia.
 */
async function fetchNextPendingTask(
  userId: string,
  flag: "is_medication" | "is_consultation",
  today: string
): Promise<Task | null> {
  const { data, error } = await supabase
    .from("task")
    .select("*")
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

/**
 * Quantas medições a janela de `latestMetrics` traz. Seis tipos × ~20 medições cobre folgado o que
 * a seção "Progresso" precisa (a última de cada tipo e a anterior, para a variação) sem paginar —
 * o Postgres não faz "N por grupo" sem RPC, então a alternativa seria uma query por tipo.
 */
const METRICS_WINDOW = 120;

/**
 * Erro de coluna/tabela que ainda não existe no banco remoto. As migrations da 063
 * (`20260816210000`, `20260816220000`) só são aplicadas pelo usuário com `supabase db push`; até
 * lá, o dashboard tem de continuar mostrando dose, consulta e hábitos em vez de quebrar inteiro.
 * Mesmo tratamento defensivo de `fetchHealthHabitsToday` e de `createHabit`.
 */
function isMissingRelation(message: string): boolean {
  return /health_metric|reminder_preference|does not exist|schema cache/i.test(
    message
  );
}

/** Janela da adesão exibida no dashboard e na lista de tratamentos — as duas têm de bater. */
const ADHERENCE_DAYS = 30;

/**
 * Resumo do sub-módulo Vida > Saúde: dose (060), consulta (061), métricas e lembretes (063),
 * tratamentos e adesão (064).
 */
export async function loadHealthSummary(): Promise<HealthSummary> {
  const userId = await getCurrentUserId();
  const today = formatLocalIsoDate(new Date());
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - ADHERENCE_DAYS);

  const [
    nextMedicationDose,
    nextConsultation,
    latestMetrics,
    reminderPreferences,
    medications,
    recentDoses,
  ] = await Promise.all([
    fetchNextPendingTask(userId, "is_medication", today),
    fetchNextPendingTask(userId, "is_consultation", today),
    fetchHealthMetrics(),
    fetchReminderPreferences(),
    fetchMedications(true),
    fetchDosesSince(formatLocalIsoDate(windowStart)),
  ]);

  return {
    nextMedicationDose,
    nextConsultation,
    latestMetrics,
    reminderPreferences,
    // Calculada aqui, não guardada: a fonte é a mesma lista de doses que a tela mostra.
    medicationAdherence: computeAdherence(recentDoses),
    activeMedicationCount: medications.length,
  };
}

/**
 * Janela recente de medições corporais, da mais nova para a mais antiga. Sem `type`, traz todos os
 * tipos — é o que alimenta `latestByType` e `deltaSincePrevious` (`src/domain/health/metrics.ts`).
 */
export async function fetchHealthMetrics(
  type?: MetricType | null,
  limit = METRICS_WINDOW
): Promise<HealthMetric[]> {
  const userId = await getCurrentUserId();

  let query = supabase
    .from("health_metric")
    .select("*")
    .eq("user_id", userId)
    .order("recorded_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (type) query = query.eq("metric_type", type);

  const { data, error } = await query;
  if (error) {
    if (isMissingRelation(error.message)) return [];
    throw new Error(error.message);
  }
  return (data ?? []) as HealthMetric[];
}

/** Grava uma medição corporal. `user_id` vem sempre do usuário logado — a RLS confirma no banco. */
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

/** Preferências de lembrete do usuário — uma linha por `entity_type` já configurado. */
export async function fetchReminderPreferences(): Promise<ReminderPreference[]> {
  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from("reminder_preference")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    if (isMissingRelation(error.message)) return [];
    throw new Error(error.message);
  }
  return (data ?? []) as ReminderPreference[];
}

/**
 * Cria ou atualiza a preferência de um `entity_type`. O alvo do conflito é o
 * `unique (user_id, entity_type)` da migration: mexer no lembrete de água atualiza a linha que já
 * existe em vez de acumular configurações concorrentes do mesmo tipo.
 */
export async function upsertReminderPreference(
  entityType: ReminderEntityType,
  patch: {
    frequency?: ReminderFrequency;
    time_of_day?: string | null;
    enabled?: boolean;
    last_notified_at?: string | null;
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

/**
 * Marca o lembrete como já entregue no período corrente. É o que impede o toast de repetir a cada
 * recarga da página — `isReminderDue` compara `last_notified_at` com o slot do período.
 */
export async function markReminderNotified(
  entityType: ReminderEntityType,
  when: Date = new Date()
): Promise<ReminderPreference> {
  return upsertReminderPreference(entityType, {
    last_notified_at: when.toISOString(),
  });
}

/**
 * Hábitos de saúde (feature 062) com o check-in de hoje — o que a seção "Hoje" do Health Dashboard
 * lista. São `habit` comuns marcados com `is_health`, então o histórico, o streak e a meta semanal
 * continuam saindo do módulo de Hábitos; aqui só interessa "fez hoje ou não".
 *
 * Enquanto a migration `20260816200000_habit_is_health.sql` não for aplicada, a coluna não existe e
 * o Postgres devolve erro — nesse caso a seção fica vazia em vez de derrubar o dashboard inteiro
 * (que já mostra dose e consulta desde a 060/061). Mesmo tratamento defensivo de `createHabit`.
 */
export async function fetchHealthHabitsToday(): Promise<HealthHabitToday[]> {
  const userId = await getCurrentUserId();
  const today = formatLocalIsoDate(new Date());

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

  // `habit_log` não tem `user_id`: o escopo vem do dono do hábito, e os ids acima já são só do
  // usuário logado (a RLS confirma isso no banco — supabase/tests/habit_is_health).
  const { data: logs, error: logsError } = await supabase
    .from("habit_log")
    .select("habit_id, completed")
    .in("habit_id", habits.map((habit) => habit.id))
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
