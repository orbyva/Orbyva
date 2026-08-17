import { useCallback, useEffect, useState } from "react";
import { Check, GlassWater, HeartPulse, Pill, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { PageShell } from "@/components/PageShell";
import { PAGE_HEADER_ACTIONS_CLASS } from "@/components/FormLabel";
import { TableLoadingSkeleton } from "@/components/TableLoadingSkeleton";
import { ConsultationQuickCreateDialog } from "@/pages/admin/tasks/ConsultationQuickCreateDialog";
import { MedicationQuickCreateDialog } from "@/pages/admin/tasks/MedicationQuickCreateDialog";
import { fetchHealthHabitsToday, loadHealthSummary } from "@/api/health";
import { toggleHabitLog } from "@/api/habits";
import { frequencyLabel } from "@/domain/habits";
import { formatDateTimeBR } from "@/lib/currency";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { useLocalDay } from "@/hooks/useLocalDay";
import { useToast } from "@/hooks/use-toast";
import type { HealthHabitToday, HealthSummary } from "@/types/health";

/**
 * Porta de entrada do sub-módulo Vida > Saúde (feature 060). Hoje mostra a próxima dose de
 * medicação — que já existe como tarefa com `is_medication` desde a 049 — e a próxima consulta
 * médica (`is_consultation`, feature 061). É onde as features 062 (água/alimentação), 063
 * (métricas e lembretes) e 064 (controle de medicamentos) penduram suas seções.
 */
export default function HealthDashboard() {
  const [summary, setSummary] = useState<HealthSummary | null>(null);
  const [healthHabits, setHealthHabits] = useState<HealthHabitToday[]>([]);
  const [loading, setLoading] = useState(true);
  const [medicationDialogOpen, setMedicationDialogOpen] = useState(false);
  const [consultationDialogOpen, setConsultationDialogOpen] = useState(false);
  const today = useLocalDay();
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextSummary, habits] = await Promise.all([
        loadHealthSummary(),
        fetchHealthHabitsToday(),
      ]);
      setSummary(nextSummary);
      setHealthHabits(habits);
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
  }, [toast]);

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

  const nextDose = summary?.nextMedicationDose ?? null;
  const nextConsultation = summary?.nextConsultation ?? null;
  const habitsDone = healthHabits.filter((item) => item.doneToday).length;

  // O CTA do estado vazio de cada seção é o mesmo botão do header — só um dos dois aparece por vez,
  // por seção.
  return (
    <PageShell
      title="Saúde"
      eyebrow="Vida"
      description="Hábitos do dia, medicações e consultas"
      actions={
        nextDose || nextConsultation ? (
          <div className={PAGE_HEADER_ACTIONS_CLASS}>
            {nextDose ? (
              <Button onClick={() => setMedicationDialogOpen(true)}>
                Cadastrar medicação
              </Button>
            ) : null}
            {nextConsultation ? (
              <Button
                variant="outline"
                onClick={() => setConsultationDialogOpen(true)}
              >
                Agendar consulta
              </Button>
            ) : null}
          </div>
        ) : null
      }
    >
      {/* Hoje (feature 062): água e alimentação são `habit` com `is_health` — o check-in daqui é o
          mesmo `habit_log` da página de Hábitos, então streak e heatmap continuam valendo. */}
      <section
        aria-labelledby="health-today"
        className="rounded-xl border bg-card shadow-sm"
      >
        <header className="flex items-center gap-2 border-b px-4 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(var(--health))]/10 text-[hsl(var(--health))]">
            <GlassWater className="h-4 w-4" />
          </span>
          <h2 id="health-today" className="text-sm font-semibold">
            Hoje
          </h2>
          {healthHabits.length > 0 ? (
            <span className="ml-auto text-xs text-muted-foreground">
              {habitsDone} de {healthHabits.length} concluídos
            </span>
          ) : null}
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
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        aria-labelledby="health-next-dose"
        className="rounded-xl border bg-card shadow-sm"
      >
        <header className="flex items-center gap-2 border-b px-4 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(var(--health))]/10 text-[hsl(var(--health))]">
            <HeartPulse className="h-4 w-4" />
          </span>
          <h2 id="health-next-dose" className="text-sm font-semibold">
            Próxima dose
          </h2>
        </header>

        {loading ? (
          <TableLoadingSkeleton rows={1} columns={3} />
        ) : nextDose ? (
          <div className="flex flex-col gap-1 px-4 py-4">
            <p className="text-base font-semibold">{nextDose.title}</p>
            <p className="text-sm text-muted-foreground">
              {formatDateTimeBR(nextDose.due_date, nextDose.due_time)}
            </p>
          </div>
        ) : (
          <EmptyState
            icon={Pill}
            title="Nenhuma dose agendada"
            description="Cadastre uma medicação para acompanhar as próximas doses por aqui."
            action={
              <Button onClick={() => setMedicationDialogOpen(true)}>
                Cadastrar medicação
              </Button>
            }
          />
        )}
      </section>

      {/* Consultas (feature 061): a consulta é uma tarefa com `is_consultation`, então agendar aqui
          já a coloca no calendário geral — não há entidade separada para listar. */}
      <section
        aria-labelledby="health-next-consultation"
        className="rounded-xl border bg-card shadow-sm"
      >
        <header className="flex items-center gap-2 border-b px-4 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(var(--health))]/10 text-[hsl(var(--health))]">
            <Stethoscope className="h-4 w-4" />
          </span>
          <h2 id="health-next-consultation" className="text-sm font-semibold">
            Consultas
          </h2>
        </header>

        {loading ? (
          <TableLoadingSkeleton rows={1} columns={3} />
        ) : nextConsultation ? (
          <div className="flex flex-col gap-1 px-4 py-4">
            <p className="text-base font-semibold">{nextConsultation.title}</p>
            <p className="text-sm text-muted-foreground">
              {formatDateTimeBR(
                nextConsultation.due_date,
                nextConsultation.due_time
              )}
            </p>
            {nextConsultation.description ? (
              <p className="text-sm text-muted-foreground">
                {nextConsultation.description}
              </p>
            ) : null}
          </div>
        ) : (
          <EmptyState
            icon={Stethoscope}
            title="Nenhuma consulta agendada"
            description="Agende uma consulta para vê-la aqui e no calendário geral."
            action={
              <Button onClick={() => setConsultationDialogOpen(true)}>
                Agendar consulta
              </Button>
            }
          />
        )}
      </section>

      <MedicationQuickCreateDialog
        open={medicationDialogOpen}
        onOpenChange={setMedicationDialogOpen}
        onCreated={load}
      />

      <ConsultationQuickCreateDialog
        open={consultationDialogOpen}
        onOpenChange={setConsultationDialogOpen}
        onCreated={load}
      />
    </PageShell>
  );
}
