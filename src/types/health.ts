import type { Habit } from "@/types/habits";
import type { Task } from "@/types/tasks";

/**
 * Resumo do sub-módulo Vida > Saúde (feature 060).
 *
 * Hoje só carrega a próxima dose de medicação, que sai de `task` com `is_medication = true`
 * (feature 049) — não há tabela própria de saúde ainda. O tipo cresce junto com as features que
 * preenchem cada campo: 061 acrescenta a próxima consulta, 063 acrescenta métricas corporais e
 * preferências de lembrete. Campo sem tipo real (e sem quem o popule) não entra aqui antes da hora:
 * o projeto é TS strict e `any` para "reservar espaço" não é opção.
 */
export interface HealthSummary {
  /** Próxima ocorrência pendente de uma medicação, ou `null` quando não há nenhuma agendada. */
  nextMedicationDose: Task | null;
  /**
   * Próxima consulta médica pendente (`task` com `is_consultation = true`, feature 061), ou `null`
   * quando não há nenhuma agendada. Mesma origem da dose: consulta é tarefa, não tabela própria.
   */
  nextConsultation: Task | null;
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
