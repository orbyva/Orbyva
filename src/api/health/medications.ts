import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth-user";
import {
  computeMissingDoses,
  computeStaleDoses,
  formatDoseTitle,
  medicationTimes,
  MEDICATION_TASK_ICON_KEY,
} from "@/domain/health/medication";
import {
  deleteTaskRows,
  deleteTaskSeries,
  insertMaterializedTasks,
} from "@/api/tasks/taskRows";
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
    // `existingDoses: []` é correto **por construção**, não por descuido (revisto na feature 074):
    // `medication.id` acabou de ser gerado pelo insert acima, então não existe uma única linha de
    // `task` apontando para ele — buscar as doses seria uma query garantidamente vazia. O caso que
    // sobrava, dois envios do formulário em paralelo, é coberto pelo `on conflict do nothing` de
    // `insertMaterializedTasks`, e a carga seguinte de tarefas passa a enxergar estas doses e não
    // as recria (coberto em `health.medications.test.ts`).
    const doses = await materializeMedicationDoses(medication, [], userId);
    return { medication, doses };
  } catch (error) {
    console.error("Falha ao materializar as doses da medicação:", error);
    return { medication, doses: [] };
  }
}

/**
 * Edita o tratamento **e reconcilia as doses já materializadas** (feature 074).
 *
 * Sem a segunda parte, mudar o horário de 08:00 para 09:00 deixava todas as doses futuras das 08:00
 * de pé e a próxima `fetchTasks` criava as das 09:00 ao lado: duas doses por dia no calendário, para
 * sempre. O mesmo valia para `interval_days`, `started_on` e `ended_on`.
 *
 * O que é apagado sai de `computeStaleDoses` — só doses **futuras e não concluídas**. Dose passada e
 * dose já tomada são o histórico de adesão da `064` e nunca são tocadas. As doses certas não são
 * criadas aqui: a materialização (`materializeMedicationDoses`) faz isso sozinha na carga seguinte,
 * que é o mesmo caminho de sempre.
 *
 * O erro da limpeza **sobe** — de propósito, e ao contrário das sincronizações de `updateTask`, que
 * são engolidas num `console.error`. Deixar dose fantasma no calendário é exatamente o bug que esta
 * feature conserta; falhar em silêncio devolveria o usuário para ele sem avisar.
 */
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

  await reconcileMedicationDoses(id, userId);
}

/**
 * Apaga as doses futuras que a configuração atual do tratamento não prevê mais. Relê o tratamento
 * do banco em vez de mesclar o payload em memória: `updateMedication` recebe um patch parcial, e a
 * decisão de o que é obsoleto depende do estado **inteiro** (`times`, `interval_days`,
 * `started_on`, `ended_on`, `active`) já normalizado pelo banco.
 */
async function reconcileMedicationDoses(id: string, userId: string): Promise<void> {
  const { data: medication, error } = await supabase
    .from("medication")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!medication) return;

  const doses = await fetchMedicationDoses(id);
  const stale = computeStaleDoses(
    medication as Medication,
    doses.map((dose) => ({
      id: dose.id,
      due_date: dose.due_date,
      dose_time: dose.dose_time,
      status: dose.status,
      completed_at: dose.completed_at,
    })),
    formatLocalIsoDate(new Date())
  );

  await deleteTaskRows(stale, userId);
}

/**
 * Encerra um tratamento: **só** `active = false`.
 *
 * Não escreve `ended_on` (feature 096). Até então, encerrar gravava a data de hoje quando a coluna
 * estava nula — e o usuário passava a ver um "Término" que nunca pôs. É literalmente a frase que
 * abriu a 096: "está marcado como encerrado, sendo que não coloquei limite". `ended_on` significa
 * **fim programado pelo usuário**, e nada mais (`src/types/health.ts`); escrever ali por conta
 * própria violava o contrato da coluna e tornava um encerramento acidental indistinguível de um
 * curso com fim marcado na hora de desfazer.
 *
 * `active = false` já para tudo sozinho, sem ajuda de `ended_on`: `computeMissingDoses` devolve
 * `[]`, `nextDoseSlot` devolve `null` e `computeStaleDoses` marca toda dose futura pendente como
 * obsoleta (`src/domain/health/medication.ts`). Por isso o `select` prévio da coluna também saiu:
 * ele só existia para alimentar o `??`.
 *
 * Não apaga a linha — o histórico de doses já tomadas e a adesão do período continuam válidos, e
 * apagar zeraria `task.medication_id` (`on delete set null`) em todas as doses passadas.
 */
export async function deactivateMedication(id: string): Promise<void> {
  const userId = await getCurrentUserId();

  const { error } = await supabase
    .from("medication")
    .update({ active: false })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/**
 * Desfaz o encerramento (feature 096): `active = true` de volta, e `ended_on` limpo **só quando a
 * data já passou**.
 *
 * A limpeza condicional é o que faz o botão significar alguma coisa. `computeMissingDoses` colapsa
 * a janela em `ended_on` quando ele é anterior a hoje (`medication.ts:105-107`), então reativar sem
 * limpar um término passado devolveria um tratamento "ativo" que não gera dose nenhuma — o botão
 * pareceria funcionar e não faria nada, que é pior do que não existir. Já um `ended_on` no
 * **futuro** é um fim programado que ainda não chegou: apagá-lo mudaria o tratamento do usuário
 * sem ele pedir, então ele fica.
 *
 * `ended_on` **igual a hoje** conta como passado e é limpo. O plano dizia "no passado", mas hoje
 * não é nem um nem outro, e manter a data deixaria o tratamento gerar só as doses de hoje e morrer
 * de novo amanhã — o mesmo botão-que-não-faz-nada, com um dia de atraso. Não é caso hipotético: é
 * exatamente o valor que o `deactivateMedication` antigo gravava, então é o estado da linha que
 * esta feature existe para consertar.
 *
 * As doses do período voltam sozinhas: `materializeAllMedicationDoses` recalcula desde `started_on`
 * na próxima `fetchTasks`. O que não volta é dose concluída que tenha sido apagada — a adesão
 * daquele trecho está perdida, e é isso que a confirmação na tela avisa.
 */
export async function reactivateMedication(id: string): Promise<void> {
  const userId = await getCurrentUserId();

  const { data: current, error: readError } = await supabase
    .from("medication")
    .select("ended_on")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (readError) throw new Error(readError.message);

  const endedOn = (current?.ended_on ?? null) as string | null;
  const today = formatLocalIsoDate(new Date());
  const payload: Record<string, unknown> = { active: true };
  if (endedOn != null && endedOn <= today) payload.ended_on = null;

  const { error } = await supabase
    .from("medication")
    .update(payload)
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/**
 * Em que etapa a operação de duas partes parou (feature 075). O dialog precisa disso para dizer o
 * que **de fato** aconteceu: "nada foi apagado" e "o tratamento acabou, mas as doses ficaram" são
 * situações diferentes, e um toast genérico faria o usuário repetir a ação sem saber por quê.
 */
export type EndMedicationStage = "deactivate" | "delete";

export class EndMedicationError extends Error {
  constructor(
    readonly stage: EndMedicationStage,
    message: string,
    override readonly cause?: unknown
  ) {
    super(message);
    this.name = "EndMedicationError";
  }
}

/** O mínimo que `endMedicationAndDeleteFutureDoses` precisa saber da linha clicada. */
interface DoseTarget {
  id: string;
  medication_id?: string | null;
  recurrence_rule?: Task["recurrence_rule"];
  recurrence_origin_id?: string | null;
}

/**
 * A ação recomendada do `TaskDeleteDialog` (feature 075): **encerra o tratamento** e só então apaga
 * as doses futuras ainda não tomadas.
 *
 * A ordem não é arbitrária. Apagar antes de encerrar é exatamente o bug que o usuário reportou — a
 * `medication` continua `active`, e a próxima `fetchTasks` chama `materializeAllMedicationDoses`,
 * que recalcula desde `started_on` e **recria** tudo o que acabou de sair. Encerrando primeiro, a
 * pior falha possível (o `delete` quebrar no meio) deixa doses velhas na tela, mas elas não voltam
 * a ser geradas e uma segunda tentativa resolve. Na ordem inversa, a mesma falha devolveria o
 * usuário ao "apago e volta" sem nenhum aviso.
 *
 * Por isso o erro carrega a etapa: quem chama consegue distinguir "não encerrou, nada foi apagado"
 * de "encerrou, mas as doses ficaram" e dizer isso na tela, em vez de um "erro ao excluir" genérico.
 */
export async function endMedicationAndDeleteFutureDoses(task: DoseTarget): Promise<number> {
  const medicationId = task.medication_id;
  if (!medicationId) {
    throw new EndMedicationError("deactivate", "Esta tarefa não pertence a um tratamento.");
  }

  try {
    await deactivateMedication(medicationId);
  } catch (error) {
    throw new EndMedicationError(
      "deactivate",
      "Não foi possível encerrar o tratamento. Nenhuma dose foi apagada.",
      error
    );
  }

  try {
    return await deleteTaskSeries(task, { mode: "end-treatment" });
  } catch (error) {
    throw new EndMedicationError(
      "delete",
      "O tratamento foi encerrado, mas não foi possível apagar as doses futuras. " +
        "Elas não voltam a ser criadas — tente apagá-las de novo.",
      error
    );
  }
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
    // Dose é uma tarefa **pontual** (feature 072): acontece num instante, então na Agenda ela é
    // bolinha marcável em vez de bloco de 30 min. Gravar `0` explícito deixa a cláusula
    // `is_medication` de `isPointTask` como rede de segurança só das doses antigas.
    estimated_duration: 0,
    recurrence_rule: null,
    recurrence_origin_id: null,
    is_medication: true,
    // Feature 071: a dose é uma tarefa **pontual** — um instante, não um bloco de 30 min sintéticos.
    // `is_quick` é o que faz a agenda (070) desenhá-la como bolinha marcável em um clique, e o
    // preset `pill` é o que a distingue das outras pontuais do dia sem precisar de texto.
    is_quick: true,
    icon_key: MEDICATION_TASK_ICON_KEY,
    medication_id: medication.id,
  }));

  // `upsert` com `on conflict do nothing` (feature 074): duas cargas de tarefas concorrentes
  // calculam o mesmo conjunto faltante, e a dose que a outra já criou vira no-op em vez de linha
  // duplicada no calendário. Ver `src/api/tasks/materialize.ts`.
  const { data, error } = await insertMaterializedTasks(rows);
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
