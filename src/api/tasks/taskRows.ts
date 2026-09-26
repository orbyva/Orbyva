import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth-user";
import { resolveDeleteScope, type TaskDeleteOption, type TaskDeleteScope } from "@/domain/tasks";
import { formatLocalIsoDate } from "@/lib/dates";

/**
 * Escritas de baixo nível na tabela `task` compartilhadas por `src/api/tasks/tasks.ts` e
 * `src/api/health/medications.ts`. Mora num arquivo próprio porque os dois já se importam num
 * sentido só (tasks → medications) e importar de volta fecharia um ciclo.
 */

/**
 * A escrita das três materializações de `task` — ocorrências de recorrência simples
 * (`materializeRecurringInstances`), parcelas vinculadas à Recorrência Financeira
 * (`materializeLinkedInstances`) e doses de medicação (`materializeMedicationDoses`).
 *
 * ## Por que `upsert` e não `insert` (feature 074)
 *
 * `fetchTasks` é uma leitura que **escreve**: `select *` seguido de até três passes de insert, com
 * deduplicação só em memória. Duas chamadas concorrentes — a `TaskList` monta a `AgendaGrid` dentro
 * da aba "agenda", e o `<StrictMode>` duplica efeitos em dev — leem o mesmo "antes", calculam o
 * mesmo conjunto faltante e escrevem as duas. Com `insert` puro isso duplicava linha (antes dos
 * índices únicos desta feature) e passaria a estourar um 23505 vermelho na tela (depois deles).
 * `on conflict do nothing` transforma a corrida perdida em no-op, que é a semântica correta: a
 * linha que eu ia criar já existe.
 *
 * **Sem `onConflict` de propósito.** Os dois índices da migration
 * `..._task_dedupe_doses_e_ocorrencias.sql` são **parciais** (`where medication_id is not null`;
 * `where recurrence_origin_id is not null and linked_recurring_id is null`). O parâmetro
 * `on_conflict` do PostgREST vira um `ON CONFLICT (colunas)` sem predicado, e o Postgres não
 * consegue inferir um índice parcial a partir disso ("there is no unique or exclusion constraint
 * matching the ON CONFLICT specification"). Omitir o parâmetro faz o PostgREST emitir um
 * `ON CONFLICT DO NOTHING` sem alvo, que cobre **qualquer** constraint da tabela — inclusive as
 * parciais. Comportamento verificado em Postgres 16 no harness
 * `supabase/tests/task_dedupe_doses/run.sh`.
 *
 * O `.select()` no fim continua devolvendo só as linhas efetivamente criadas: as ignoradas pelo
 * conflito não voltam, e é isso que quem chama junta ao resultado de `fetchTasks`.
 */
export function insertMaterializedTasks(rows: Array<Record<string, unknown>>) {
  return supabase.from("task").upsert(rows, { ignoreDuplicates: true }).select();
}

/**
 * `DELETE ... WHERE id IN (...)` escopado no usuário — um round-trip só, mais barato e atômico que
 * N deletes. É o corpo de `deleteTasks` (`src/api/tasks/tasks.ts`), aqui embaixo para a
 * reconciliação de doses de `updateMedication` poder reusá-lo sem fechar um ciclo de import.
 */
export async function deleteTaskRows(ids: string[], userId: string): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase
    .from("task")
    .delete()
    .in("id", ids)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/**
 * A fatia do `PostgrestFilterBuilder` que `applyDeleteScope` usa, escrita à mão porque o tipo real
 * do cliente é genérico o bastante para estourar o limite de instanciação do TS quando a mesma
 * função precisa aceitar tanto o builder de `select(..., { head: true })` quanto o de `delete()`
 * (TS2589). Os dois expõem exatamente estes cinco filtros e resolvem no mesmo envelope
 * `{ count?, error }`, então o contrato estreito é fiel — e é o que os testes conseguem falsificar.
 */
interface TaskScopeQuery
  extends PromiseLike<{ count?: number | null; error: { message: string } | null }> {
  eq(column: string, value: unknown): TaskScopeQuery;
  or(expression: string): TaskScopeQuery;
  gte(column: string, value: string): TaskScopeQuery;
  is(column: string, value: unknown): TaskScopeQuery;
  neq(column: string, value: unknown): TaskScopeQuery;
}

/** `head: true` — volta só o `count`, sem trafegar as linhas. */
function scopeCountQuery(): TaskScopeQuery {
  return supabase
    .from("task")
    .select("id", { count: "exact", head: true }) as unknown as TaskScopeQuery;
}

/**
 * Feature 075 — os filtros que traduzem um `TaskDeleteScope` em `WHERE`, aplicados igualmente à
 * contagem e à exclusão. Serem os **mesmos** é o ponto: o número que o dialog mostra é a promessa do
 * que o botão vai apagar, e as duas queries divergirem seria mentir para o usuário antes de uma ação
 * destrutiva.
 *
 * O escopo é resolvido **no servidor**, no molde de `propagateIconToSeries` (feature 073). Até aqui
 * "excluir todas as ocorrências" montava a lista de ids com `findSeriesTasks` sobre `visibleTasks` —
 * o array já **filtrado** por projeto/tag/status na tela —, então um filtro ativo fazia o botão
 * apagar só a parte visível da série, em silêncio.
 *
 * `.or(...)` monta a união do diagnóstico da 074: `id = origem OR recurrence_origin_id = origem OR
 * medication_id = <med>`. `user_id` fica **fora** do `.or` de propósito — é um `and` sobre o
 * conjunto inteiro, e é o que impede o escopo de vazar para outro usuário mesmo que a RLS caia.
 */
function applyDeleteScope(
  query: TaskScopeQuery,
  scope: TaskDeleteScope,
  userId: string
): TaskScopeQuery {
  const scoped = query.eq("user_id", userId);
  if (scope.kind === "single") return scoped.eq("id", scope.taskId);

  const clauses: string[] = [];
  if (scope.originId) {
    clauses.push(`id.eq.${scope.originId}`, `recurrence_origin_id.eq.${scope.originId}`);
  }
  if (scope.medicationId) clauses.push(`medication_id.eq.${scope.medicationId}`);
  // Sem cláusula nenhuma o `.or` viraria um `delete` de escopo aberto sobre o usuário inteiro;
  // `resolveDeleteScope` já garante que isso não acontece, mas a rede fica aqui também.
  if (clauses.length === 0) return scoped.eq("id", scope.taskId);

  let filtered = scoped.or(clauses.join(","));
  if (scope.onlyFuture) filtered = filtered.gte("due_date", formatLocalIsoDate(new Date()));
  if (!scope.includeCompleted) {
    // `status` além de `completed_at` porque as duas marcas de "já foi feito" existem no banco: as
    // doses tomadas pela 064 gravam `completed_at`, mas linhas antigas podem estar `done` sem ele
    // (o campo é posterior). Numa exclusão destrutiva, o critério tem de ser o mais conservador.
    filtered = filtered.is("completed_at", null).neq("status", "done");
  }
  return filtered;
}

/**
 * Quantas linhas o escopo escolhido apagaria — `head: true`, então volta só o `count`, sem trafegar
 * as linhas. É o número que o `TaskDeleteDialog` mostra antes de o usuário confirmar.
 */
export async function countTaskSeries(
  task: Parameters<typeof resolveDeleteScope>[0],
  option: TaskDeleteOption
): Promise<number> {
  const userId = await getCurrentUserId();
  const scope = resolveDeleteScope(task, option);
  const { count, error } = await applyDeleteScope(scopeCountQuery(), scope, userId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * Apaga o conjunto que `resolveDeleteScope` descreve e devolve **quantas linhas saíram** — o toast
 * de sucesso diz o número, e sem ele o usuário não teria como saber se a exclusão em massa pegou a
 * série inteira ou só o que estava na tela.
 *
 * A contagem vem de um `select` antes do `delete` (e não do `.select()` encadeado no próprio
 * delete) porque o retorno de linhas apagadas depende de `Prefer: return=representation`, que o
 * PostgREST só honra com `.select()` — e aí voltariam as linhas inteiras, para nada. Duas queries
 * baratas contra uma cara.
 *
 * **Não** encerra o tratamento: `scope.endsTreatment` é um sinal para quem chama
 * (`endMedicationAndDeleteFutureDoses`, em `src/api/health/medications.ts`), porque apagar as doses
 * sem desativar a `medication` faz a próxima `fetchTasks` recriar todas — o "apago e volta" que é o
 * cerne do bug desta feature.
 */
export async function deleteTaskSeries(
  task: Parameters<typeof resolveDeleteScope>[0],
  option: TaskDeleteOption
): Promise<number> {
  const userId = await getCurrentUserId();
  const scope = resolveDeleteScope(task, option);

  const { count, error: countError } = await applyDeleteScope(scopeCountQuery(), scope, userId);
  if (countError) throw new Error(countError.message);

  const { error } = await applyDeleteScope(
    supabase.from("task").delete() as unknown as TaskScopeQuery,
    scope,
    userId
  );
  if (error) throw new Error(error.message);
  return count ?? 0;
}
