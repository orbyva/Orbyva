import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth-user";
import { formatLocalIsoDate } from "@/lib/dates";
import type { HealthSummary } from "@/types/health";
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

/** Resumo do sub-módulo Vida > Saúde: próxima dose (060) e próxima consulta (061). */
export async function loadHealthSummary(): Promise<HealthSummary> {
  const userId = await getCurrentUserId();
  const today = formatLocalIsoDate(new Date());

  const [nextMedicationDose, nextConsultation] = await Promise.all([
    fetchNextPendingTask(userId, "is_medication", today),
    fetchNextPendingTask(userId, "is_consultation", today),
  ]);

  return { nextMedicationDose, nextConsultation };
}
