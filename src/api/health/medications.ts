import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth-user";
import {
  computeMissingDoses,
  formatDoseTitle,
  medicationTimes,
} from "@/domain/health/medication";
import { formatLocalIsoDate } from "@/lib/dates";
import type {
  Medication,
  MedicationCreateRequest,
  MedicationUpdateRequest,
} from "@/types/health";
import type { Task } from "@/types/tasks";

/**
 * I/O dos tratamentos medicamentosos (feature 064). A lógica de "quais doses faltam" e "como se
 * chama a dose" vive em `src/domain/health/medication.ts`; aqui só há Supabase.
 */

/**
 * Erro de tabela/coluna que ainda não existe no banco remoto. As migrations da 064
 * (`20260816230000`, `20260816233000`) só são aplicadas pelo usuário com `supabase db push`; até
 * lá, a lista de tarefas e o dashboard têm de continuar funcionando em vez de quebrar inteiros.
 * Mesmo tratamento defensivo de `fetchHealthMetrics` e `fetchHealthHabitsToday`.
 */
export function isMissingMedicationRelation(message: string): boolean {
  return /medication|dose_time|does not exist|schema cache/i.test(message);
}

/** Tratamentos do usuário. `activeOnly` é o que a materialização e o dashboard usam. */
export async function fetchMedications(activeOnly = false): Promise<Medication[]> {
  const userId = await getCurrentUserId();

  let query = supabase
    .from("medication")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (activeOnly) query = query.eq("active", true);

  const { data, error } = await query;
  if (error) {
    if (isMissingMedicationRelation(error.message)) return [];
    throw new Error(error.message);
  }
  return (data ?? []) as Medication[];
}

/**
 * Cria o tratamento. `user_id` vem sempre do usuário logado — a RLS confirma no banco.
 *
 * Não materializa doses aqui de propósito: quem chama decide quando (o dialog chama logo em
 * seguida, para a dose de hoje já aparecer). Manter as duas coisas separadas é o que permite
 * `materializeMedicationDoses` ser chamada em laço na carga de tarefas sem duplicar nada.
 */
export async function createMedication(
  input: MedicationCreateRequest
): Promise<Medication> {
  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from("medication")
    .insert([
      {
        user_id: userId,
        name: input.name.trim(),
        dose_amount: input.dose_amount ?? null,
        dose_unit: input.dose_unit?.trim() ? input.dose_unit.trim() : null,
        instructions: input.instructions?.trim() ? input.instructions.trim() : null,
        times: medicationTimes({ times: input.times }),
        interval_days: Math.max(1, Math.trunc(input.interval_days || 1)),
        started_on: input.started_on,
        ended_on: input.ended_on ?? null,
        active: input.active ?? true,
      },
    ])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as Medication;
}

/** O tratamento recém-criado e as doses que já nasceram como tarefa junto com ele. */
export interface CreatedMedication {
  medication: Medication;
  /** Linhas de `task` inseridas agora. Vazio quando nenhuma dose venceu ainda. */
  doses: Task[];
}

/**
 * Cria o tratamento e já materializa as doses que ele deveria ter gerado até hoje, para o remédio
 * aparecer no calendário na mesma hora em vez de só na próxima carga de tarefas.
 *
 * Devolve as doses criadas (reabertura de 2026-08-18): é o que permite à tela dizer quantas doses
 * viraram tarefa. Sem esse retorno, o usuário cadastra um remédio e não tem como saber que ele
 * entrou na agenda — que é justamente o que o pedido chama de "integração com as tarefas".
 *
 * Falhar na materialização não pode virar erro na tela: o tratamento **foi** criado, e as doses
 * saem na próxima `fetchTasks` de qualquer jeito. Mesmo tratamento das sincronizações de
 * `updateTask` (`src/api/tasks/tasks.ts`) — e, nesse caso, a contagem devolvida é 0, que é a
 * verdade do que aconteceu agora.
 */
export async function createMedicationWithDoses(
  input: MedicationCreateRequest
): Promise<CreatedMedication> {
  const medication = await createMedication(input);
  try {
    const userId = await getCurrentUserId();
    const doses = await materializeMedicationDoses(medication, [], userId);
    return { medication, doses };
  } catch (error) {
    console.error("Falha ao materializar as doses da medicação:", error);
    return { medication, doses: [] };
  }
}

export async function updateMedication(
  input: MedicationUpdateRequest
): Promise<void> {
  const userId = await getCurrentUserId();
  const { id, ...fields } = input;

  const payload: Record<string, unknown> = { ...fields };
  if (fields.name != null) payload.name = fields.name.trim();
  if (fields.times != null) payload.times = medicationTimes({ times: fields.times });
  if (fields.interval_days != null) {
    payload.interval_days = Math.max(1, Math.trunc(fields.interval_days || 1));
  }

  const { error } = await supabase
    .from("medication")
    .update(payload)
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/**
 * Encerra um tratamento: `active = false` + `ended_on` = hoje, se ainda não houver fim.
 *
 * Não apaga a linha — o histórico de doses já tomadas e a adesão do período continuam válidos, e
 * apagar zeraria `task.medication_id` (`on delete set null`) em todas as doses passadas.
 */
export async function deactivateMedication(id: string): Promise<void> {
  const userId = await getCurrentUserId();

  const { data: current, error: readError } = await supabase
    .from("medication")
    .select("ended_on")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (readError) throw new Error(readError.message);

  const { error } = await supabase
    .from("medication")
    .update({
      active: false,
      ended_on: current?.ended_on ?? formatLocalIsoDate(new Date()),
    })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/** As doses (tasks) já materializadas de um tratamento. */
export async function fetchMedicationDoses(medicationId: string): Promise<Task[]> {
  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from("task")
    .select("*")
    .eq("user_id", userId)
    .eq("medication_id", medicationId)
    .order("due_date", { ascending: true, nullsFirst: false });

  if (error) {
    if (isMissingMedicationRelation(error.message)) return [];
    throw new Error(error.message);
  }
  return (data ?? []) as Task[];
}

/**
 * Todas as doses do usuário a partir de uma data — a janela de adesão da lista de tratamentos.
 * Uma query só para todos os tratamentos: agrupar por `medication_id` no cliente é mais barato que
 * uma query por tratamento.
 */
export async function fetchDosesSince(since: string): Promise<Task[]> {
  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from("task")
    .select("*")
    .eq("user_id", userId)
    .not("medication_id", "is", null)
    .gte("due_date", since)
    .order("due_date", { ascending: true, nullsFirst: false });

  if (error) {
    if (isMissingMedicationRelation(error.message)) return [];
    throw new Error(error.message);
  }
  return (data ?? []) as Task[];
}

/**
 * Materializa em `task` as doses que faltam de **um** tratamento e devolve as linhas criadas.
 *
 * `existingDoses` são as doses já materializadas dele; passar a lista de fora é o que permite
 * chamar isto dentro de `fetchTasks` com as tarefas que já foram lidas, sem uma query por
 * tratamento. Uma dose por (data × horário): é daqui que sai "duas doses por dia no calendário".
 */
export async function materializeMedicationDoses(
  medication: Medication,
  existingDoses: Task[],
  userId: string,
  today = formatLocalIsoDate(new Date())
): Promise<Task[]> {
  const missing = computeMissingDoses(medication, existingDoses, today);
  if (missing.length === 0) return [];

  const title = formatDoseTitle(medication);
  const rows = missing.map((slot) => ({
    user_id: userId,
    project_id: null,
    parent_task_id: null,
    title,
    description: medication.instructions ?? null,
    status: "todo",
    due_date: slot.date,
    // `due_time` continua sendo preenchido: é o que a Agenda, o calendário e `isDoseLate` (049)
    // leem. `dose_time` é o mesmo horário do lado do tratamento, e é a chave de deduplicação.
    due_time: slot.time,
    dose_time: slot.time,
    recurrence_rule: null,
    recurrence_origin_id: null,
    is_medication: true,
    medication_id: medication.id,
  }));

  const { data, error } = await supabase.from("task").insert(rows).select();
  if (error) throw new Error(error.message);
  return (data ?? []) as Task[];
}

/**
 * Materializa as doses pendentes de **todos** os tratamentos ativos do usuário, a partir das
 * tarefas já carregadas. É o gancho chamado por `fetchTasks` (`src/api/tasks/tasks.ts`), no mesmo
 * ponto de `materializeRecurringInstances`/`materializeLinkedInstances` — as doses aparecem no
 * calendário sem nenhuma tela nova.
 *
 * Falha aqui não pode derrubar a lista de tarefas: enquanto a migration da 064 não for aplicada, a
 * tabela `medication` não existe e o app precisa continuar mostrando as tarefas normalmente.
 */
export async function materializeAllMedicationDoses(
  userId: string,
  tasks: Task[]
): Promise<Task[]> {
  let medications: Medication[];
  try {
    medications = await fetchMedications(true);
  } catch {
    return tasks;
  }
  if (medications.length === 0) return tasks;

  const today = formatLocalIsoDate(new Date());
  const created: Task[] = [];

  for (const medication of medications) {
    const existing = tasks.filter((task) => task.medication_id === medication.id);
    try {
      created.push(
        ...(await materializeMedicationDoses(medication, existing, userId, today))
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!isMissingMedicationRelation(message)) throw error;
      return tasks;
    }
  }

  return created.length === 0 ? tasks : [...tasks, ...created];
}
