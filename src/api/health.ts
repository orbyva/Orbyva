import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth-user";
import { formatLocalIsoDate } from "@/lib/dates";
import type { Habit } from "@/types/habits";
import type { HealthHabitToday, HealthSummary } from "@/types/health";
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

  // Métricas e preferências entram na tarefa seguinte da 063 (`fetchHealthMetrics` /
  // `fetchReminderPreferences`); por ora o resumo declara os campos vazios para o contrato de
  // `HealthSummary` valer desde já.
  return {
    nextMedicationDose,
    nextConsultation,
    latestMetrics: [],
    reminderPreferences: [],
  };
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
