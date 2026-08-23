import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth-user";
import {
  computeMissingLinkedInstallments,
  computeMissingOccurrences,
  resolveSeriesOriginId,
  type TaskSortOrderPair,
} from "@/domain/tasks";
import { calculateInstallments, resolvePaymentStartDate } from "@/domain/recurring";
import {
  fetchRecurringTransactionsByIds,
  updateRecurringParcelPayment,
} from "@/api/recurring";
import { resolveItemStatusFromTask } from "@/domain/shopping/taskLink";
import { materializeAllMedicationDoses } from "@/api/health/medications";
import { deleteTaskRows, insertMaterializedTasks } from "@/api/tasks/taskRows";
/**
 * Feature 075. A implementação mora em `taskRows.ts` pelo mesmo motivo de `deleteTaskRows`
 * (feature 074): `src/api/health/medications.ts` precisa chamar `deleteTaskSeries` para encerrar um
 * tratamento, e este arquivo já importa `medications.ts` — importar de volta fecharia um ciclo. O
 * re-export mantém `@/api/tasks` como a porta de entrada única das telas.
 */
export { countTaskSeries, deleteTaskSeries } from "@/api/tasks/taskRows";
import { formatLocalIsoDate } from "@/lib/dates";
import type {
  Task,
  TaskCreateRequest,
  TaskStatus,
  TaskUpdateRequest,
} from "@/types/tasks";

async function materializeRecurringInstances(
  userId: string,
  tasks: Task[]
): Promise<Task[]> {
  const origins = tasks.filter(
    (task) =>
      task.recurrence_rule &&
      !task.recurrence_origin_id &&
      task.due_date &&
      // Séries de medicação (feature 064) são materializadas por `materializeMedicationDoses`, a
      // partir de `medication.times` — este caminho só sabe do `time` singular da regra e geraria
      // uma dose a mais por dia, em duplicidade com aquele. O backfill preserva a
      // `recurrence_rule` da origem de propósito (é o registro do que a série era), então é este
      // filtro, e não o apagamento da regra, que impede a dupla materialização.
      !task.medication_id
  );
  if (origins.length === 0) return tasks;

  const today = formatLocalIsoDate(new Date());
  const newRows: Array<Record<string, unknown>> = [];

  for (const origin of origins) {
    const existingDates = tasks
      .filter((task) => task.recurrence_origin_id === origin.id && task.due_date)
      .map((task) => task.due_date as string);

    const missing = computeMissingOccurrences(
      origin.due_date as string,
      origin.recurrence_rule!,
      existingDates,
      today
    );

    for (const date of missing) {
      newRows.push({
        user_id: userId,
        project_id: origin.project_id,
        parent_task_id: null,
        title: origin.title,
        description: origin.description ?? null,
        status: "todo",
        tag_ids: origin.tag_ids,
        due_date: date,
        due_time: origin.recurrence_rule?.time ?? null,
        recurrence_rule: null,
        recurrence_origin_id: origin.id,
        is_medication: origin.is_medication ?? false,
        is_consultation: origin.is_consultation ?? false,
        // Feature 070: sem isto, "trocar lençol toda semana" seria bolinha só na origem e bloco em
        // todas as repetições — a materialização copia um subconjunto explícito dos campos.
        is_quick: origin.is_quick ?? false,
        // Feature 073: o ícone é da série. Sem copiar aqui, a próxima materialização criaria
        // ocorrências sem ícone e desfaria a propagação retroativa.
        icon_key: origin.icon_key ?? null,
        icon_url: origin.icon_url ?? null,
      });
    }
  }

  if (newRows.length === 0) return tasks;

  const { data, error } = await insertMaterializedTasks(newRows);
  if (error) throw new Error(error.message);
  return [...tasks, ...(data ?? [])];
}

async function materializeLinkedInstances(
  userId: string,
  tasks: Task[]
): Promise<Task[]> {
  const templates = tasks.filter(
    (task) => task.linked_recurring_id && task.linked_installment_number == null
  );
  if (templates.length === 0) return tasks;

  const recurringIds = Array.from(
    new Set(templates.map((task) => task.linked_recurring_id as string))
  );
  const recurringRows = await fetchRecurringTransactionsByIds(recurringIds);
  const recurringById = new Map(recurringRows.map((row) => [row.id, row]));

  const newRows: Array<Record<string, unknown>> = [];

  for (const template of templates) {
    const recurring = recurringById.get(template.linked_recurring_id as string);
    if (!recurring || !recurring.status) continue;

    const installments = calculateInstallments(
      resolvePaymentStartDate(recurring),
      recurring.due_day,
      recurring.installment_count,
      recurring.validity,
      recurring.frequency
    );
    if (!Array.isArray(installments)) continue;

    const paidParcels = recurring.paid_parcels ?? [];
    const openInstallments = installments.filter(
      (installment) => !paidParcels.includes(installment.number)
    );

    const materializedNumbers = tasks
      .filter(
        (task) =>
          task.linked_recurring_id === template.linked_recurring_id &&
          task.linked_installment_number != null
      )
      .map((task) => task.linked_installment_number as number);

    const missing = computeMissingLinkedInstallments(
      openInstallments,
      materializedNumbers
    );

    for (const installment of missing) {
      newRows.push({
        user_id: userId,
        project_id: template.project_id,
        parent_task_id: null,
        title: template.title,
        description: template.description ?? null,
        status: "todo",
        tag_ids: template.tag_ids,
        due_date: installment.dueDate,
        recurrence_rule: null,
        recurrence_origin_id: template.id,
        linked_recurring_id: template.linked_recurring_id,
        linked_installment_number: installment.number,
        // Feature 073: mesma regra da recorrência simples — o ícone pertence à série.
        icon_key: template.icon_key ?? null,
        icon_url: template.icon_url ?? null,
      });
    }
  }

  if (newRows.length === 0) return tasks;

  const { data, error } = await insertMaterializedTasks(newRows);
  if (error) throw new Error(error.message);
  return [...tasks, ...(data ?? [])];
}

export async function fetchTasks(): Promise<Task[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("task")
    .select("*")
    .eq("user_id", userId)
    .order("due_date", { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);
  const withRecurring = await materializeRecurringInstances(userId, data ?? []);
  const withLinked = await materializeLinkedInstances(userId, withRecurring);
  // Doses de medicação (feature 064): mesmo ponto do fluxo das outras duas materializações, para
  // as doses aparecerem no calendário/agenda sem tela nova.
  return materializeAllMedicationDoses(userId, withLinked);
}

export async function fetchTaskById(id: string): Promise<Task | null> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("task")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function createTask(task: TaskCreateRequest): Promise<Task> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("task")
    .insert([{ ...task, user_id: userId }])
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Feature 073: o ícone é propriedade da **série**, não da ocorrência — mexer nele em qualquer
 * ocorrência (ou na origem) vale para a série inteira, inclusive as ocorrências passadas e já
 * concluídas. Sem isso a mesma série apareceria com ícones mistos na linha do tempo do
 * `SeriesOccurrencesDialog` e na visão "Concluídas".
 *
 * O escopo `id = originId OR recurrence_origin_id = originId` cobre de graça tanto a recorrência
 * simples quanto as séries vinculadas à Recorrência Financeira (as duas gravam
 * `recurrence_origin_id` nas ocorrências), sem precisar da lista de tarefas no cliente.
 */
async function propagateIconToSeries(
  taskId: string,
  userId: string,
  icon: Record<string, unknown>
): Promise<void> {
  const { data: task, error } = await supabase
    .from("task")
    .select("id, recurrence_rule, recurrence_origin_id")
    .eq("id", taskId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!task) return;

  const originId = resolveSeriesOriginId(task);
  if (!originId) return;

  const { error: updateError } = await supabase
    .from("task")
    .update({ ...icon, updated_at: new Date().toISOString() })
    .or(`id.eq.${originId},recurrence_origin_id.eq.${originId}`)
    .eq("user_id", userId);
  if (updateError) throw new Error(updateError.message);
}

export async function updateTask(data: TaskUpdateRequest): Promise<void> {
  const userId = await getCurrentUserId();
  const { id, ...fields } = data;
  const payload: Record<string, unknown> = {
    ...fields,
    updated_at: new Date().toISOString(),
  };
  if (fields.status === "done") payload.completed_at = new Date().toISOString();
  const { error } = await supabase
    .from("task")
    .update(payload)
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);

  // Fora do try/catch silencioso dos syncs abaixo de propósito: a propagação **é** o
  // comportamento pedido na feature 073, então a falha tem que subir e virar toast no chamador,
  // em vez de sumir num `console.error` deixando a série com ícones divergentes.
  const iconFields: Record<string, unknown> = {};
  if (fields.icon_key !== undefined) iconFields.icon_key = fields.icon_key;
  if (fields.icon_url !== undefined) iconFields.icon_url = fields.icon_url;
  // Só paga o `select` extra quando o payload traz ícone — arrastar no Gantt, trocar status ou
  // editar prazo continuam com um `update` só.
  if (Object.keys(iconFields).length > 0) {
    await propagateIconToSeries(id, userId, iconFields);
  }

  if (fields.status) {
    try {
      await syncLinkedInstallmentFromTask(id, userId, fields.status === "done");
    } catch (syncError) {
      console.error("Falha ao sincronizar parcela vinculada:", syncError);
    }
    try {
      await syncLinkedShoppingItemFromTask(id, userId, fields.status);
    } catch (syncError) {
      console.error("Falha ao sincronizar item de compras vinculado:", syncError);
    }
  }
}

/**
 * Reflete a conclusão/reabertura da tarefa no item da Lista de Compras vinculado (feature 051):
 * tarefa `done` marca o item como comprado, tarefa reaberta devolve o item para pendente.
 * Grava direto em `shopping_item` — de propósito não chama `setShoppingItemStatus`, que
 * sincronizaria de volta para a tarefa e criaria ping-pong entre os dois lados.
 */
async function syncLinkedShoppingItemFromTask(
  taskId: string,
  userId: string,
  taskStatus: TaskStatus
): Promise<void> {
  const { data: task, error } = await supabase
    .from("task")
    .select("linked_shopping_item_id")
    .eq("id", taskId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!task?.linked_shopping_item_id) return;

  const { error: itemError } = await supabase
    .from("shopping_item")
    .update({
      status: resolveItemStatusFromTask(taskStatus),
      updated_at: new Date().toISOString(),
    })
    .eq("id", task.linked_shopping_item_id)
    .eq("user_id", userId);
  if (itemError) throw new Error(itemError.message);
}

/**
 * Sincroniza a Recorrência Financeira vinculada (se houver) com a conclusão/
 * reabertura da tarefa. Reaproveita `updateRecurringParcelPayment`, que já
 * cria/remove a transação e atualiza `paid_parcels`.
 */
async function syncLinkedInstallmentFromTask(
  taskId: string,
  userId: string,
  becomingDone: boolean
): Promise<void> {
  const { data: task, error } = await supabase
    .from("task")
    .select("linked_recurring_id, linked_installment_number")
    .eq("id", taskId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!task?.linked_recurring_id || task.linked_installment_number == null) return;

  const [recurring] = await fetchRecurringTransactionsByIds([
    task.linked_recurring_id,
  ]);
  if (!recurring) return;

  const paidParcels = recurring.paid_parcels ?? [];
  const isPaid = paidParcels.includes(task.linked_installment_number);
  if (becomingDone === isPaid) return;

  await updateRecurringParcelPayment(
    task.linked_recurring_id,
    task.linked_installment_number,
    paidParcels
  );
}

/**
 * Envia um ícone customizado pra uma tarefa (bucket `task-icons`, mesmo padrão de
 * `uploadAlbumCover` em `src/api/albums.ts`) e devolve a URL pública. Não atualiza `task` sozinho
 * — quem chama decide quando gravar `icon_url` (ex.: junto de `icon_key: null` via `updateTask`).
 */
export async function uploadTaskIcon(taskId: string, file: File): Promise<string> {
  const userId = await getCurrentUserId();
  const ext =
    file.type === "image/png"
      ? "png"
      : file.type === "image/webp"
        ? "webp"
        : file.type === "image/svg+xml"
          ? "svg"
          : "jpg";
  const path = `${userId}/${taskId}.${ext}`;

  const { error } = await supabase.storage
    .from("task-icons")
    .upload(path, file, { upsert: true, contentType: file.type });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from("task-icons").getPublicUrl(path);
  return data.publicUrl;
}

export async function deleteTask(id: string): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("task")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/**
 * Exclui várias tarefas de uma vez (ex.: todas as ocorrências de uma recorrência simples) num
 * único `DELETE ... WHERE id IN (...)`, mais barato e atômico que N chamadas de `deleteTask`.
 */
export async function deleteTasks(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const userId = await getCurrentUserId();
  await deleteTaskRows(ids, userId);
}

/**
 * Grava a ordem manual de uma faixa inteira do painel "Por prioridade" (feature 082) numa escrita
 * só — mesmo raciocínio do `deleteTasks` acima: a faixa é renumerada de 0..n-1 a cada solta, e N
 * chamadas de `updateTask` seriam N round-trips **e** N passagens pelos syncs de ícone/parcela que
 * o `updateTask` faz e que nada têm a ver com reordenar.
 *
 * O `select` antes do `upsert` não é enfeite, é o que torna o upsert seguro:
 * - `task.title` e `task.user_id` são `not null` sem default, então o upsert precisa carregá-los —
 *   um upsert só com `{id, sort_order}` estoura o not-null antes mesmo do `on conflict`;
 * - um id que não é do usuário (ou que não existe) sai da lista aqui, então ele nunca chega ao
 *   `upsert` — sem isso, um id forjado viraria uma **linha nova** na tabela em vez de um no-op.
 * A RLS continua sendo a rede de segurança do servidor; este filtro é o que impede a escrita errada
 * de ser tentada.
 */
export async function updateTasksSortOrder(pairs: TaskSortOrderPair[]): Promise<void> {
  if (pairs.length === 0) return;
  const userId = await getCurrentUserId();

  const { data: rows, error: readError } = await supabase
    .from("task")
    .select("id, title")
    .in(
      "id",
      pairs.map((pair) => pair.id)
    )
    .eq("user_id", userId);
  if (readError) throw new Error(readError.message);

  const titleById = new Map<string, string>(
    (rows ?? []).map((row: { id: string; title: string }) => [row.id, row.title])
  );
  const now = new Date().toISOString();
  const payload = pairs
    .filter((pair) => titleById.has(pair.id))
    .map((pair) => ({
      id: pair.id,
      user_id: userId,
      title: titleById.get(pair.id) as string,
      sort_order: pair.sort_order,
      updated_at: now,
    }));
  if (payload.length === 0) return;

  const { error } = await supabase.from("task").upsert(payload, { onConflict: "id" });
  if (error) throw new Error(error.message);
}
