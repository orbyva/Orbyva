import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Check,
  GlassWater,
  HeartPulse,
  Pencil,
  Pill,
  Plus,
  Ruler,
  Stethoscope,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { EmptyState } from "@/components/EmptyState";
import { PageShell } from "@/components/PageShell";
import {
  ICON_EDIT_BUTTON_CLASS,
  PAGE_HEADER_ACTIONS_CLASS,
} from "@/components/FormLabel";
import { ModuleGuide, ModuleGuideButton } from "@/components/ModuleGuide";
import { TableLoadingSkeleton } from "@/components/TableLoadingSkeleton";
import { HealthHabitQuickCreateDialog } from "@/pages/admin/habits/HealthHabitQuickCreateDialog";
import { RecordMetricDialog } from "@/pages/admin/life/RecordMetricDialog";
import { ReminderPreferencesDialog } from "@/pages/admin/life/ReminderPreferencesDialog";
import { ConsultationQuickCreateDialog } from "@/pages/admin/tasks/ConsultationQuickCreateDialog";
import { MedicationQuickCreateDialog } from "@/pages/admin/health/MedicationQuickCreateDialog";
import {
  deleteHealthMetric,
  fetchHealthHabitsToday,
  loadHealthSummary,
  markReminderNotified,
} from "@/api/health";
import { deleteHabit, toggleHabitLog } from "@/api/habits";
import { deactivateMedication } from "@/api/health/medications";
import { deleteTask, updateTask } from "@/api/tasks";
import {
  selectDashboardConsultations,
  selectDashboardDoses,
} from "@/domain/health/dashboard";
import { isDoseLate } from "@/domain/tasks";
import { formatTimeOfDay } from "@/pages/admin/tasks/TimeEntryRow";
import { frequencyLabel } from "@/domain/habits";
import { formatRate } from "@/domain/health/adherence";
import {
  METRIC_LABEL,
  METRIC_TYPES,
  METRIC_UNIT,
  bmiCategory,
  computeBmi,
  deltaSincePrevious,
  formatMetricValue,
  latestByType,
} from "@/domain/health/metrics";
import {
  REMINDER_ENTITY_DESCRIPTION,
  REMINDER_ENTITY_LABEL,
  isReminderDue,
} from "@/domain/health/reminder";
import { sendBrowserNotification } from "@/lib/browserNotify";
import { formatDateBR, formatDateTimeBR } from "@/lib/currency";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { useLocalDay } from "@/hooks/useLocalDay";
import { useToast } from "@/hooks/use-toast";
import type { Habit } from "@/types/habits";
import type {
  HealthHabitToday,
  HealthMetric,
  HealthSummary,
  Medication,
  ReminderPreference,
} from "@/types/health";
import type { Task, TaskStatus } from "@/types/tasks";

/**
 * Porta de entrada do sub-módulo Vida > Saúde (feature 060). Lista as doses de hoje (marcáveis
 * num clique, como o check-in de hábitos) e as próximas consultas — as mesmas `task` da agenda,
 * sem exigir ir em Tarefas para ver ou marcar. Hábitos, métricas e adesão continuam nas seções
 * que as features 062–064 penduraram aqui.
 */
export default function HealthDashboard() {
  const [summary, setSummary] = useState<HealthSummary | null>(null);
  const [healthHabits, setHealthHabits] = useState<HealthHabitToday[]>([]);
  const [loading, setLoading] = useState(true);
  const [medicationDialogOpen, setMedicationDialogOpen] = useState(false);
  const [editingMedication, setEditingMedication] = useState<Medication | null>(
    null
  );
  const [consultationDialogOpen, setConsultationDialogOpen] = useState(false);
  const [editingConsultation, setEditingConsultation] = useState<Task | null>(
    null
  );
  const [habitDialogOpen, setHabitDialogOpen] = useState(false);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [metricDialogOpen, setMetricDialogOpen] = useState(false);
  const [editingMetric, setEditingMetric] = useState<HealthMetric | null>(null);
  const [reminderDialogOpen, setReminderDialogOpen] = useState(false);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const today = useLocalDay();
  const { toast } = useToast();

  /**
   * Disparo local dos lembretes vencidos (feature 063). Roda na carga do dashboard, com a aba
   * aberta — é o transporte que o app tem hoje (`sendBrowserNotification` + toast); push com o app
   * fechado está fora desta feature.
   *
   * Depois de notificar, grava `last_notified_at` na preferência e atualiza o estado local com o
   * horário gravado: é isso que impede o mesmo lembrete de tocar de novo a cada recarga. Não
   * recarrega o resumo aqui de propósito — recarregar dentro do próprio efeito de carga seria um
   * laço.
   */
  const fireDueReminders = useCallback(
    async (preferences: ReminderPreference[]) => {
      const now = new Date();
      const due = preferences.filter((pref) => isReminderDue(pref, now));
      if (due.length === 0) return;

      for (const pref of due) {
        const title = REMINDER_ENTITY_LABEL[pref.entity_type];
        const body = REMINDER_ENTITY_DESCRIPTION[pref.entity_type];
        toast({ title, description: body, duration: 8000 });
        sendBrowserNotification(title, {
          body,
          // Uma notificação por tipo: o navegador substitui a anterior em vez de empilhar.
          tag: `orbyva-reminder-${pref.entity_type}`,
        });

        try {
          const updated = await markReminderNotified(pref.entity_type, now);
          setSummary((current) =>
            current
              ? {
                  ...current,
                  reminderPreferences: current.reminderPreferences.map((item) =>
                    item.entity_type === pref.entity_type
                      ? { ...item, last_notified_at: updated.last_notified_at }
                      : item
                  ),
                }
              : current
          );
        } catch {
          // Falhar em marcar não pode derrubar a tela: o pior caso é o lembrete repetir na
          // próxima carga, e um toast de erro aqui só assustaria sem o usuário poder agir.
        }
      }
    },
    [toast]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextSummary, habits] = await Promise.all([
        loadHealthSummary(),
        fetchHealthHabitsToday(),
      ]);
      setSummary(nextSummary);
      setHealthHabits(habits);
      void fireDueReminders(nextSummary.reminderPreferences ?? []);
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(
          error,
          "Não foi possível carregar os dados de saúde."
        ),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast, fireDueReminders]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Check-in do dia (feature 062). Otimista: a lista muda na hora e volta atrás se o banco
   * recusar. `toggleHabitLog` faz update-ou-insert do `habit_log` de hoje, então marcar aqui e
   * marcar na página de Hábitos no mesmo dia não conflitam.
   */
  async function handleCheckIn(entry: HealthHabitToday) {
    const next = !entry.doneToday;
    const revert = healthHabits;
    setHealthHabits((current) =>
      current.map((item) =>
        item.habit.id === entry.habit.id ? { ...item, doneToday: next } : item
      )
    );
    try {
      await toggleHabitLog(entry.habit.id, today, next);
    } catch (error) {
      setHealthHabits(revert);
      toast({
        title: "Erro",
        description: getErrorMessage(
          error,
          "Não foi possível registrar o hábito."
        ),
        variant: "destructive",
      });
    }
  }

  function openNewHabit() {
    setEditingHabit(null);
    setHabitDialogOpen(true);
  }

  function openEditHabit(habit: Habit) {
    setEditingHabit(habit);
    setHabitDialogOpen(true);
  }

  function openNewMetric() {
    setEditingMetric(null);
    setMetricDialogOpen(true);
  }

  function openEditMetric(metric: HealthMetric) {
    setEditingMetric(metric);
    setMetricDialogOpen(true);
  }

  function openNewMedication() {
    setEditingMedication(null);
    setMedicationDialogOpen(true);
  }

  function openEditMedication(medication: Medication) {
    setEditingMedication(medication);
    setMedicationDialogOpen(true);
  }

  function openNewConsultation() {
    setEditingConsultation(null);
    setConsultationDialogOpen(true);
  }

  function openEditConsultation(task: Task) {
    setEditingConsultation(task);
    setConsultationDialogOpen(true);
  }

  async function runDestructive(
    id: string,
    action: () => Promise<void>,
    successTitle: string
  ) {
    setMutatingId(id);
    try {
      await action();
      toast({ title: successTitle, duration: 2000 });
      await load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível concluir a ação."),
        variant: "destructive",
      });
    } finally {
      setMutatingId(null);
    }
  }

  const nextDose = summary?.nextMedicationDose ?? null;
  const adherence = summary?.medicationAdherence ?? null;
  const todayDoses = summary?.todayDoses ?? [];
  const upcomingConsultations = summary?.upcomingConsultations ?? [];
  const fallbackNextDose =
    nextDose &&
    nextDose.status === "todo" &&
    !todayDoses.some((dose) => dose.id === nextDose.id)
      ? nextDose
      : null;
  const hasMedicationActivity =
    todayDoses.length > 0 ||
    fallbackNextDose != null ||
    (summary?.activeMedicationCount ?? 0) > 0;
  const habitsDone = healthHabits.filter((item) => item.doneToday).length;

  async function handleHealthTaskToggle(task: Task) {
    const nextStatus: TaskStatus = task.status === "done" ? "todo" : "done";
    const completedAt = nextStatus === "done" ? new Date().toISOString() : null;
    const previous = summary;
    setSummary((current) => {
      if (!current) return current;
      const patch = { status: nextStatus, completed_at: completedAt };
      const patchList = (list: Task[]): Task[] =>
        list.map((item) => (item.id === task.id ? { ...item, ...patch } : item));
      return {
        ...current,
        todayDoses: selectDashboardDoses(patchList(current.todayDoses ?? []), today),
        upcomingConsultations: selectDashboardConsultations(
          patchList(current.upcomingConsultations ?? []),
          today
        ),
        nextMedicationDose:
          current.nextMedicationDose?.id === task.id
            ? { ...current.nextMedicationDose, ...patch }
            : current.nextMedicationDose,
        nextConsultation:
          current.nextConsultation?.id === task.id
            ? { ...current.nextConsultation, ...patch }
            : current.nextConsultation,
      };
    });
    try {
      await updateTask({ id: task.id, status: nextStatus });
      if (task.medication_id || task.is_medication) {
        toast(
          nextStatus === "done"
            ? {
                title: `Tomado às ${formatTimeOfDay(completedAt as string)}`,
                description: task.title,
              }
            : { title: "Marcada como não tomada", description: task.title }
        );
      } else {
        toast(
          nextStatus === "done"
            ? {
                title: `Compareceu às ${formatTimeOfDay(completedAt as string)}`,
                description: task.title,
              }
            : { title: "Comparecimento desfeito", description: task.title }
        );
      }
    } catch (error) {
      setSummary(previous);
      toast({
        title: "Erro",
        description: getErrorMessage(
          error,
          "Não foi possível atualizar o compromisso."
        ),
        variant: "destructive",
      });
    }
  }

  // Progresso (feature 063): tudo derivado da mesma janela de medições — nada disso vem pronto do
  // banco, nem o IMC (que sai do último peso com a última altura, medidos em dias diferentes).
  const metrics = summary?.latestMetrics ?? [];
  const latest = latestByType(metrics);
  const measuredTypes = METRIC_TYPES.filter((type) => latest[type]);
  const bmi = computeBmi(latest.weight?.value, latest.height?.value);
  const medications = summary?.medications ?? [];

  function medicationForDose(dose: Task): Medication | undefined {
    if (!dose.medication_id) return undefined;
    return medications.find((item) => item.id === dose.medication_id);
  }

  const fallbackMedication = fallbackNextDose
    ? medicationForDose(fallbackNextDose)
    : undefined;

  return (
    <PageShell
      title="Saúde"
      eyebrow="Vida"
      description="Hábitos do dia, medicações, consultas e progresso corporal"
      actions={
        <div className={PAGE_HEADER_ACTIONS_CLASS}>
          <ModuleGuideButton moduleId="health" />
          {/* "Lembretes" está sempre visível: é a única porta para o controle de notificações
              (feature 063), e ele existe mesmo com a tela ainda vazia. */}
          <Button variant="outline" onClick={() => setReminderDialogOpen(true)}>
            Lembretes
          </Button>
        </div>
      }
    >
      <ModuleGuide moduleId="health" />
      {/* Hoje (feature 062): água e alimentação são `habit` com `is_health` — o check-in daqui é o
          mesmo `habit_log` da página de Hábitos, então streak e heatmap continuam valendo. */}
      <section
        aria-labelledby="health-today"
        className="rounded-xl border bg-card shadow-sm"
      >
        <header className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(var(--health))]/10 text-[hsl(var(--health))]">
            <GlassWater className="h-4 w-4" />
          </span>
          <h2 id="health-today" className="text-sm font-semibold">
            Hoje
          </h2>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {healthHabits.length > 0 ? (
              <span className="text-xs text-muted-foreground">
                {habitsDone} de {healthHabits.length} concluídos
              </span>
            ) : null}
            <HealthCardAddButton
              label="Novo hábito de saúde"
              onClick={openNewHabit}
            />
          </div>
        </header>

        {loading ? (
          <TableLoadingSkeleton rows={2} columns={2} />
        ) : healthHabits.length === 0 ? (
          <EmptyState
            icon={GlassWater}
            title="Nenhum hábito de saúde"
            description="Crie hábitos como beber água ou comer frutas para acompanhar o cuidado com o corpo por aqui."
          />
        ) : (
          <ul className="divide-y">
            {healthHabits.map((entry) => (
              <li
                key={entry.habit.id}
                className="flex items-center gap-3 px-4 py-3"
              >
                <button
                  type="button"
                  onClick={() => void handleCheckIn(entry)}
                  aria-pressed={entry.doneToday}
                  aria-label={
                    entry.doneToday
                      ? `Desmarcar ${entry.habit.name} de hoje`
                      : `Marcar ${entry.habit.name} como feito hoje`
                  }
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                    entry.doneToday
                      ? "border-success bg-success text-success-foreground"
                      : "border-muted-foreground/30 hover:border-primary"
                  )}
                >
                  {entry.doneToday ? <Check className="h-4 w-4" /> : null}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {entry.habit.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {frequencyLabel(entry.habit)}
                  </p>
                </div>
                <HealthItemActions
                  editLabel={`Editar ${entry.habit.name}`}
                  deleteLabel={`Excluir ${entry.habit.name}`}
                  deleteTitle={`Excluir ${entry.habit.name}?`}
                  deleteDescription="O histórico de check-ins deste hábito também some."
                  deleting={mutatingId === entry.habit.id}
                  onEdit={() => openEditHabit(entry.habit)}
                  onDelete={() =>
                    void runDestructive(
                      entry.habit.id,
                      () => deleteHabit(entry.habit.id),
                      "Hábito excluído"
                    )
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Progresso (feature 063): a série de `health_metric`. O IMC não vem do banco — é derivado
          aqui do último peso com a última altura, que podem ter sido medidos em dias diferentes. */}
      <section
        aria-labelledby="health-progress"
        className="rounded-xl border bg-card shadow-sm"
      >
        <header className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(var(--health))]/10 text-[hsl(var(--health))]">
            <Ruler className="h-4 w-4" />
          </span>
          <h2 id="health-progress" className="text-sm font-semibold">
            Progresso
          </h2>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/life/health/progress">Ver progresso</Link>
            </Button>
            <HealthCardAddButton
              label="Registrar medição"
              onClick={openNewMetric}
            />
          </div>
        </header>

        {loading ? (
          <TableLoadingSkeleton rows={2} columns={3} />
        ) : measuredTypes.length === 0 ? (
          <EmptyState
            icon={Ruler}
            title="Nenhuma medição registrada"
            description="Registre peso, altura e medidas para acompanhar a evolução ao longo do tempo."
          />
        ) : (
          <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {measuredTypes.map((type) => {
              const measurement = latest[type]!;
              const delta = deltaSincePrevious(metrics, type);
              return (
                <article
                  key={type}
                  aria-label={METRIC_LABEL[type]}
                  className="relative rounded-lg border p-3 pr-16"
                >
                  <div className="absolute right-2 top-2">
                    <HealthItemActions
                      editLabel={`Editar ${METRIC_LABEL[type]}`}
                      deleteLabel={`Excluir medição de ${METRIC_LABEL[type]}`}
                      deleteTitle={`Excluir medição de ${METRIC_LABEL[type]}?`}
                      deleting={mutatingId === measurement.id}
                      onEdit={() => openEditMetric(measurement)}
                      onDelete={() =>
                        void runDestructive(
                          measurement.id,
                          () => deleteHealthMetric(measurement.id),
                          "Medição excluída"
                        )
                      }
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {METRIC_LABEL[type]}
                  </p>
                  <p className="text-xl font-semibold">
                    {formatMetricValue(measurement.value)} {METRIC_UNIT[type]}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateBR(measurement.recorded_date)}
                    {/* Sem cor de "bom/ruim": ganhar peso pode ser o objetivo. A variação é
                        informação, não julgamento. */}
                    {delta != null ? (
                      <span className="ml-2 font-medium text-foreground">
                        {delta === 0
                          ? "sem variação"
                          : `${delta > 0 ? "+" : "−"}${formatMetricValue(
                              Math.abs(delta)
                            )} ${METRIC_UNIT[type]}`}
                      </span>
                    ) : null}
                  </p>
                </article>
              );
            })}

            {bmi != null ? (
              <article aria-label="IMC" className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">IMC</p>
                <p className="text-xl font-semibold">
                  {formatMetricValue(bmi)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {bmiCategory(bmi)}
                </p>
              </article>
            ) : null}
          </div>
        )}
      </section>

      {/* Medicações (feature 064): o tratamento virou entidade própria (`medication`), então esta
          seção resume — próxima dose e adesão — e a gestão (cadastrar, editar, encerrar) mora em
          `/life/health/medications`. */}
      <section
        aria-labelledby="health-next-dose"
        className="rounded-xl border bg-card shadow-sm"
      >
        <header className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(var(--health))]/10 text-[hsl(var(--health))]">
            <HeartPulse className="h-4 w-4" />
          </span>
          <h2 id="health-next-dose" className="text-sm font-semibold">
            Medicações
          </h2>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/life/health/medications">Ver medicações</Link>
            </Button>
            <HealthCardAddButton
              label="Cadastrar medicação"
              onClick={openNewMedication}
            />
          </div>
        </header>

        {loading ? (
          <TableLoadingSkeleton rows={1} columns={3} />
        ) : todayDoses.length > 0 || fallbackNextDose ? (
          <div>
            {todayDoses.length > 0 ? (
              <ul className="divide-y">
                {todayDoses.map((dose) => {
                  const medication = medicationForDose(dose);
                  return (
                    <HealthTaskRow
                      key={dose.id}
                      task={dose}
                      today={today}
                      kind="dose"
                      onToggle={() => void handleHealthTaskToggle(dose)}
                      actions={
                        medication ? (
                          <HealthItemActions
                            editLabel={`Editar ${medication.name}`}
                            deleteLabel={`Encerrar ${medication.name}`}
                            deleteTitle={`Encerrar ${medication.name}?`}
                            deleteDescription="O tratamento para de gerar doses novas. As doses já registradas e o histórico continuam onde estão."
                            confirmLabel="Encerrar"
                            loadingLabel="Encerrando..."
                            deleting={mutatingId === medication.id}
                            onEdit={() => openEditMedication(medication)}
                            onDelete={() =>
                              void runDestructive(
                                medication.id,
                                () => deactivateMedication(medication.id),
                                "Tratamento encerrado"
                              )
                            }
                          />
                        ) : null
                      }
                    />
                  );
                })}
              </ul>
            ) : (
              <div className="flex items-start gap-3 px-4 py-4">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="text-xs text-muted-foreground">Próxima dose</p>
                  <p className="text-base font-semibold">
                    {fallbackNextDose!.title}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatDateTimeBR(
                      fallbackNextDose!.due_date,
                      fallbackNextDose!.due_time
                    )}
                  </p>
                </div>
                {fallbackMedication ? (
                  <HealthItemActions
                    editLabel={`Editar ${fallbackMedication.name}`}
                    deleteLabel={`Encerrar ${fallbackMedication.name}`}
                    deleteTitle={`Encerrar ${fallbackMedication.name}?`}
                    deleteDescription="O tratamento para de gerar doses novas. As doses já registradas e o histórico continuam onde estão."
                    confirmLabel="Encerrar"
                    loadingLabel="Encerrando..."
                    deleting={mutatingId === fallbackMedication.id}
                    onEdit={() => openEditMedication(fallbackMedication)}
                    onDelete={() =>
                      void runDestructive(
                        fallbackMedication.id,
                        () => deactivateMedication(fallbackMedication.id),
                        "Tratamento encerrado"
                      )
                    }
                  />
                ) : null}
              </div>
            )}
            {adherence && adherence.total > 0 ? (
              <p
                className="border-t px-4 py-3 text-sm text-muted-foreground"
                data-testid="health-adherence"
              >
                Adesão 30 dias: {formatRate(adherence.takenRate)} ({adherence.taken}{" "}
                de {adherence.total}) · {formatRate(adherence.onTimeRate)} no horário
              </p>
            ) : null}
          </div>
        ) : hasMedicationActivity ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">
            Nenhuma dose pendente para hoje.
            {adherence && adherence.total > 0 ? (
              <span className="mt-1 block" data-testid="health-adherence">
                Adesão 30 dias: {formatRate(adherence.takenRate)} ({adherence.taken}{" "}
                de {adherence.total}) · {formatRate(adherence.onTimeRate)} no horário
              </span>
            ) : null}
          </p>
        ) : (
          <EmptyState
            icon={Pill}
            title="Nenhuma dose agendada"
            description="Cadastre uma medicação para acompanhar as próximas doses por aqui."
          />
        )}
      </section>

      {/* Consultas (feature 061): a consulta é uma tarefa com `is_consultation`, então agendar aqui
          já a coloca no calendário geral — não há entidade separada para listar. */}
      <section
        aria-labelledby="health-next-consultation"
        className="rounded-xl border bg-card shadow-sm"
      >
        <header className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(var(--health))]/10 text-[hsl(var(--health))]">
            <Stethoscope className="h-4 w-4" />
          </span>
          <h2 id="health-next-consultation" className="text-sm font-semibold">
            Consultas
          </h2>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/life/health/consultations">Ver consultas</Link>
            </Button>
            <HealthCardAddButton
              label="Agendar consulta"
              onClick={openNewConsultation}
            />
          </div>
        </header>

        {loading ? (
          <TableLoadingSkeleton rows={1} columns={3} />
        ) : upcomingConsultations.length > 0 ? (
          <ul className="divide-y">
            {upcomingConsultations.map((consultation) => (
              <HealthTaskRow
                key={consultation.id}
                task={consultation}
                today={today}
                kind="consultation"
                onToggle={() => void handleHealthTaskToggle(consultation)}
                actions={
                  <HealthItemActions
                    editLabel={`Editar ${consultation.title}`}
                    deleteLabel={`Excluir ${consultation.title}`}
                    deleteTitle={`Excluir ${consultation.title}?`}
                    deleteDescription="Só esta ocorrência é removida. A série, se existir, continua."
                    deleting={mutatingId === consultation.id}
                    onEdit={() => openEditConsultation(consultation)}
                    onDelete={() =>
                      void runDestructive(
                        consultation.id,
                        () => deleteTask(consultation.id),
                        "Consulta excluída"
                      )
                    }
                  />
                }
              />
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={Stethoscope}
            title="Nenhuma consulta agendada"
            description="Agende uma consulta para vê-la aqui e no calendário geral."
          />
        )}
      </section>

      <RecordMetricDialog
        key={editingMetric?.id ?? "nova-medicao"}
        open={metricDialogOpen}
        onOpenChange={(next) => {
          setMetricDialogOpen(next);
          if (!next) setEditingMetric(null);
        }}
        onRecorded={load}
        metric={editingMetric}
      />

      <ReminderPreferencesDialog
        open={reminderDialogOpen}
        onOpenChange={setReminderDialogOpen}
        preferences={summary?.reminderPreferences ?? []}
        onSaved={load}
      />

      <HealthHabitQuickCreateDialog
        key={editingHabit?.id ?? "novo-habito"}
        open={habitDialogOpen}
        onOpenChange={(next) => {
          setHabitDialogOpen(next);
          if (!next) setEditingHabit(null);
        }}
        onCreated={load}
        habit={editingHabit}
      />

      <MedicationQuickCreateDialog
        key={editingMedication?.id ?? "nova-medicacao"}
        open={medicationDialogOpen}
        onOpenChange={(next) => {
          setMedicationDialogOpen(next);
          if (!next) setEditingMedication(null);
        }}
        onCreated={load}
        medication={editingMedication}
      />

      <ConsultationQuickCreateDialog
        key={editingConsultation?.id ?? "nova-consulta"}
        open={consultationDialogOpen}
        onOpenChange={(next) => {
          setConsultationDialogOpen(next);
          if (!next) setEditingConsultation(null);
        }}
        onCreated={load}
        task={editingConsultation}
      />
    </PageShell>
  );
}

function healthScheduleLabel(
  date: string | null | undefined,
  time: string | null | undefined,
  today: string
): string {
  const clock = time?.slice(0, 5);
  if (date === today) return clock ? `hoje às ${clock}` : "hoje";
  return formatDateTimeBR(date, time);
}

function doseTakenNote(task: Task): string | null {
  if (task.status !== "done" || !task.completed_at) return null;
  const tomado = `Tomado ${formatTimeOfDay(task.completed_at)}`;
  return isDoseLate(task) ? `${tomado} (atrasada)` : tomado;
}

function HealthCardAddButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="icon"
      className="h-8 w-8"
      aria-label={label}
      onClick={onClick}
    >
      <Plus className="h-4 w-4" />
    </Button>
  );
}

function HealthItemActions({
  editLabel,
  deleteLabel,
  deleteTitle,
  deleteDescription,
  onEdit,
  onDelete,
  deleting,
  confirmLabel,
  loadingLabel,
}: {
  editLabel: string;
  deleteLabel: string;
  deleteTitle: string;
  deleteDescription?: string;
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
  confirmLabel?: string;
  loadingLabel?: string;
}) {
  return (
    <div className="flex shrink-0 items-center">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn("h-7 w-7", ICON_EDIT_BUTTON_CLASS)}
        onClick={onEdit}
        aria-label={editLabel}
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <ConfirmDeleteDialog
        title={deleteTitle}
        description={deleteDescription}
        onConfirm={onDelete}
        loading={deleting}
        confirmLabel={confirmLabel}
        loadingLabel={loadingLabel}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-destructive"
          aria-label={deleteLabel}
          disabled={deleting}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </ConfirmDeleteDialog>
    </div>
  );
}

function HealthTaskRow({
  task,
  today,
  kind,
  onToggle,
  actions,
}: {
  task: Task;
  today: string;
  kind: "dose" | "consultation";
  onToggle: () => void;
  actions?: ReactNode;
}) {
  const done = task.status === "done";
  const late = kind === "dose" && done && isDoseLate(task);
  const taken = kind === "dose" ? doseTakenNote(task) : null;
  const action = kind === "dose"
    ? done
      ? `Desmarcar ${task.title} como tomada`
      : `Marcar ${task.title} como tomada`
    : done
      ? `Desmarcar comparecimento em ${task.title}`
      : `Marcar comparecimento em ${task.title}`;

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={done}
        aria-label={action}
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
          done
            ? "border-success bg-success text-success-foreground"
            : "border-muted-foreground/30 hover:border-primary",
          late && "ring-2 ring-amber-400 ring-offset-2 ring-offset-card"
        )}
      >
        {done ? <Check className="h-4 w-4" /> : null}
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{task.title}</p>
        <p className="text-xs text-muted-foreground">
          {healthScheduleLabel(task.due_date, task.due_time, today)}
          {taken ? (
            <span className="ml-2 font-medium text-foreground">{taken}</span>
          ) : null}
          {kind === "consultation" && done && task.completed_at ? (
            <span className="ml-2 font-medium text-foreground">
              Compareceu {formatTimeOfDay(task.completed_at)}
            </span>
          ) : null}
        </p>
        {kind === "consultation" && task.description ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{task.description}</p>
        ) : null}
      </div>
      {actions}
    </li>
  );
}
