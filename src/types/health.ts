import type { Habit } from "@/types/habits";
import type { Task } from "@/types/tasks";

/**
 * Resumo do sub-módulo Vida > Saúde (feature 060).
 *
 * Dose e consulta saem de `task` (`is_medication` da 049, `is_consultation` da 061) — não há tabela
 * de medicação nem de consulta. As métricas corporais e as preferências de lembrete, sim: a 063
 * criou `health_metric` e `reminder_preference`, as duas primeiras tabelas próprias do módulo.
 */
export interface HealthSummary {
  /** Próxima ocorrência pendente de uma medicação, ou `null` quando não há nenhuma agendada. */
  nextMedicationDose: Task | null;
  /**
   * Próxima consulta médica pendente (`task` com `is_consultation = true`, feature 061), ou `null`
   * quando não há nenhuma agendada. Mesma origem da dose: consulta é tarefa, não tabela própria.
   */
  nextConsultation: Task | null;
  /**
   * Janela recente de `health_metric` do usuário (feature 063), da mais nova para a mais antiga —
   * é dela que a seção "Progresso" deriva a última medição de cada tipo (`latestByType`) **e** a
   * variação em relação à anterior (`deltaSincePrevious`), que precisa de duas linhas do mesmo
   * tipo. Guardar só a última de cada tipo mataria a variação, e o Postgres não faz "N por grupo"
   * sem RPC — daí a janela.
   */
  latestMetrics: HealthMetric[];
  /** Preferências de lembrete do usuário (feature 063) — uma linha por `entity_type` configurado. */
  reminderPreferences: ReminderPreference[];
}

/** Tipos de medição corporal — espelha o check de `health_metric.metric_type`. */
export type MetricType = "weight" | "height" | "waist" | "hip" | "chest" | "arm";

/**
 * Uma medição corporal (feature 063). `value` está na unidade do tipo: kg para `weight`, cm para
 * os demais. IMC não é campo — sai de peso + altura em `src/domain/health/metrics.ts`.
 */
export interface HealthMetric {
  id: string;
  user_id?: string;
  metric_type: MetricType;
  value: number;
  /** Data civil da medição (`YYYY-MM-DD`), não timestamp: pesar-se é um evento do dia. */
  recorded_date: string;
  notes?: string | null;
  created_at?: string;
}

export type HealthMetricCreateRequest = Omit<
  HealthMetric,
  "id" | "user_id" | "created_at"
>;

/** O que pode ter lembrete — espelha o check de `reminder_preference.entity_type`. */
export type ReminderEntityType =
  | "medication"
  | "consultation"
  | "water"
  | "nutrition"
  | "body_metric";

/** Cadência do lembrete — espelha o check de `reminder_preference.frequency`. */
export type ReminderFrequency = "daily" | "weekly" | "monthly";

/**
 * Configuração de lembrete de um tipo de entidade (feature 063). Uma linha por
 * (`user_id`, `entity_type`) — é a preferência, não o disparo: nenhuma ocorrência futura vira linha
 * no banco (um lembrete de água a cada dia geraria milhares). Quais lembretes estão vencidos agora
 * é função pura em `src/domain/health/reminder.ts`, calculada na carga do dashboard.
 */
export interface ReminderPreference {
  id: string;
  user_id?: string;
  entity_type: ReminderEntityType;
  frequency: ReminderFrequency;
  /** `HH:MM` ou `HH:MM:SS` (o Postgres devolve com segundos); `null` cai no padrão 09:00. */
  time_of_day: string | null;
  enabled: boolean;
  /** ISO do último disparo entregue; `null` = nunca notificado. */
  last_notified_at: string | null;
  /** Âncora da cadência semanal/mensal (dia da semana / dia do mês). */
  created_at?: string;
}

/**
 * Hábito de saúde (água, alimentação — feature 062) com o estado do check-in de hoje.
 *
 * Não há tabela de nutrição: o hábito é um `habit` comum com `is_health = true`, e "bebi água
 * hoje" é a linha de `habit_log` do dia. Por isso o registro é booleano — quantidade (litros,
 * gramas) ficou fora do escopo até existir a feature completa que a alimente.
 */
export interface HealthHabitToday {
  habit: Habit;
  /** Há `habit_log` de hoje com `completed = true` para este hábito. */
  doneToday: boolean;
}
