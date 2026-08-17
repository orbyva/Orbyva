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
