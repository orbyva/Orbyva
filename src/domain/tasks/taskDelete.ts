import { resolveSeriesOriginId } from "./recurrence";
import { isMedicationDoseTask, isSimpleRecurringTask } from "./agenda";
import type { RecurrenceRule } from "@/types/tasks";

/**
 * Feature 075 — a regra de "o que exatamente vai ser apagado" fica aqui, fora da camada de I/O.
 *
 * `src/api/tasks/tasks.ts` só traduz o descritor devolvido por `resolveDeleteScope` em filtros do
 * PostgREST. É o que permite provar as decisões difíceis (o escopo da medicação backfillada, "só as
 * futuras", "não apagar o que já foi tomado") num teste puro, sem Supabase falso e sem navegador.
 */

/** O que o usuário escolheu no `TaskDeleteDialog`. */
export type TaskDeleteMode =
  /** Só esta linha — o comportamento de sempre, e o único disponível para tarefa avulsa. */
  | "single"
  /** Todas as ocorrências de uma recorrência simples (feature 028). */
  | "series"
  /** Encerra o tratamento e apaga as doses futuras ainda não tomadas. */
  | "end-treatment"
  /** Todas as doses do tratamento, passadas inclusive; `includeCompleted` decide as já tomadas. */
  | "all-doses";

export interface TaskDeleteOption {
  mode: TaskDeleteMode;
  /**
   * Só é lido no modo `all-doses`. Padrão `false`: dose concluída é o histórico de adesão da
   * feature 064, e apagá-la por omissão falsificaria a métrica sem o usuário perceber.
   */
  includeCompleted?: boolean;
}

export interface TaskDeleteScope {
  /**
   * `single` apaga uma linha por id; `series`/`doses` apagam um conjunto resolvido **no servidor**,
   * sem depender da lista carregada (e filtrada) na tela.
   */
  kind: "single" | "series" | "doses";
  /** A linha que originou a exclusão. Sempre presente — é o alvo do modo `single`. */
  taskId: string;
  /** Âncora da série (`id = originId or recurrence_origin_id = originId`), quando houver. */
  originId: string | null;
  /** Tratamento cujas doses entram no escopo (`medication_id = medicationId`), quando houver. */
  medicationId: string | null;
  /** Restringe a `due_date >= hoje` — o passado é histórico e nunca é apagado por engano. */
  onlyFuture: boolean;
  /** `false` acrescenta `completed_at is null` ao escopo: o que já foi feito fica. */
  includeCompleted: boolean;
  /** O chamador precisa desativar o tratamento antes de apagar, senão as doses voltam. */
  endsTreatment: boolean;
}

interface DeletableTask {
  id: string;
  recurrence_rule?: RecurrenceRule | null;
  recurrence_origin_id?: string | null;
  linked_recurring_id?: string | null;
  medication_id?: string | null;
}

function seriesTaskShape(task: DeletableTask) {
  return {
    id: task.id,
    due_date: null,
    status: "todo",
    recurrence_rule: task.recurrence_rule ?? null,
    recurrence_origin_id: task.recurrence_origin_id ?? null,
    linked_recurring_id: task.linked_recurring_id ?? null,
    medication_id: task.medication_id ?? null,
  };
}

/** Só a exclusão de uma linha — o destino de todo modo que não se aplica à tarefa recebida. */
function singleScope(taskId: string): TaskDeleteScope {
  return {
    kind: "single",
    taskId,
    originId: null,
    medicationId: null,
    onlyFuture: false,
    includeCompleted: true,
    endsTreatment: false,
  };
}

/**
 * Traduz a escolha do dialog no conjunto exato de linhas a apagar.
 *
 * Duas regras não óbvias, as duas vindas do diagnóstico da feature 074:
 *
 * 1. **O escopo de um tratamento é a união de três condições**, não uma só:
 *    `id = origem OR recurrence_origin_id = origem OR medication_id = <med>`. A tarefa-origem
 *    backfillada (`20260816233000_medication_backfill.sql`) é uma quimera — série **e** dose —, e a
 *    série dela tem dois tipos de filho: as ocorrências antigas da 049 (`recurrence_origin_id`
 *    apontando pra origem) e as doses novas da 064 (`recurrence_origin_id` nulo, só
 *    `medication_id`). Olhar só um dos lados deixa linhas para trás, e a materialização seguinte
 *    devolve o resto para a tela.
 * 2. **Qualquer modo pedido para uma tarefa que não o comporta cai em `single`.** Uma parcela de
 *    Recorrência Financeira nunca vira exclusão em massa (ela tem sync bidirecional próprio), e uma
 *    tarefa avulsa não tem série nem tratamento — degradar para "apaga só esta" é o que impede uma
 *    opção obsoleta na tela virar um `delete` de escopo aberto.
 */
export function resolveDeleteScope(
  task: DeletableTask,
  option: TaskDeleteOption
): TaskDeleteScope {
  const shape = seriesTaskShape(task);

  if (option.mode === "series") {
    if (!isSimpleRecurringTask(shape)) return singleScope(task.id);
    const originId = resolveSeriesOriginId(shape);
    if (!originId) return singleScope(task.id);
    return {
      kind: "series",
      taskId: task.id,
      originId,
      medicationId: null,
      onlyFuture: false,
      includeCompleted: true,
      endsTreatment: false,
    };
  }

  if (option.mode === "end-treatment" || option.mode === "all-doses") {
    if (!isMedicationDoseTask(shape)) return singleScope(task.id);
    const endsTreatment = option.mode === "end-treatment";
    return {
      kind: "doses",
      taskId: task.id,
      // A origem entra no escopo só quando a própria linha é da série (origem backfillada ou
      // ocorrência antiga dela); a dose pura da 064 não tem série nenhuma e resolve como `null`.
      originId: resolveSeriesOriginId(shape),
      medicationId: shape.medication_id,
      onlyFuture: endsTreatment,
      includeCompleted: endsTreatment ? false : (option.includeCompleted ?? false),
      endsTreatment,
    };
  }

  return singleScope(task.id);
}
