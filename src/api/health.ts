import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth-user";
import { formatLocalIsoDate } from "@/lib/dates";
import type { HealthSummary } from "@/types/health";
import type { Task } from "@/types/tasks";

/**
 * Próxima dose pendente de medicação (feature 060).
 *
 * Não há tabela de medicação: desde a feature 049 uma medicação é uma tarefa recorrente com
 * `is_medication = true`, e cada dose é uma ocorrência materializada dessa série. Por isso a
 * consulta é em `task` — pendente (`status = 'todo'`), agendada de hoje em diante, a primeira por
 * `due_date` e, no mesmo dia, por `due_time`.
 *
 * `due_time` nulo vai para o fim do dia (`nullsFirst: false`): uma dose sem horário não deve passar
 * na frente de uma marcada para as 8h do mesmo dia.
 */
export async function loadHealthSummary(): Promise<HealthSummary> {
  const userId = await getCurrentUserId();
  const today = formatLocalIsoDate(new Date());

  const { data, error } = await supabase
    .from("task")
    .select("*")
    .eq("user_id", userId)
    .eq("is_medication", true)
    .eq("status", "todo")
    .gte("due_date", today)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("due_time", { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return { nextMedicationDose: (data as Task | null) ?? null };
}
