import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth-user";
import type { TaskRefSummary } from "@/types/tasks";

/**
 * A leitura em lote das tarefas citadas por `[Rótulo](orbyva-task:<id>)` (feature 105).
 *
 * Mora **fora** de `src/api/tasks/tasks.ts` de propósito, e o motivo é o mesmo já medido na 104
 * (`useTaskRefExtensions`): aquele módulo arrasta a API de recorrência, a de medicação e o domínio
 * de tarefas inteiro. Quem consome esta função é o preview de nota — uma rota que não precisa de
 * nada disso para abrir —, então importá-la de lá colaria todo aquele grafo no chunk de Notas.
 * Aqui só entram `supabase` e `getCurrentUserId`, que toda rota autenticada já carrega.
 *
 * `select` estreito (`id, title, status, due_date`) pela mesma razão: são os três campos que o chip
 * mostra, e trafegar a linha inteira por chip na tela seria pagar caro por nada.
 */
export async function fetchTaskRefSummaries(
  ids: readonly string[]
): Promise<TaskRefSummary[]> {
  if (ids.length === 0) return [];
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("task")
    .select("id, title, status, due_date")
    .eq("user_id", userId)
    .in("id", [...ids]);
  if (error) throw new Error(error.message);
  // Id que não volta simplesmente não existe (ou não é visível): é assim que o chip descobre que a
  // tarefa foi apagada — sem erro, sem tocar no texto de quem escreveu (decisão da 105).
  return (data ?? []) as TaskRefSummary[];
}
