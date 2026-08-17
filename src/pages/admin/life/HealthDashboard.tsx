import { useCallback, useEffect, useState } from "react";
import { HeartPulse, Pill, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { PageShell } from "@/components/PageShell";
import { PAGE_HEADER_ACTIONS_CLASS } from "@/components/FormLabel";
import { TableLoadingSkeleton } from "@/components/TableLoadingSkeleton";
import { ConsultationQuickCreateDialog } from "@/pages/admin/tasks/ConsultationQuickCreateDialog";
import { MedicationQuickCreateDialog } from "@/pages/admin/tasks/MedicationQuickCreateDialog";
import { loadHealthSummary } from "@/api/health";
import { formatDateTimeBR } from "@/lib/currency";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/hooks/use-toast";
import type { HealthSummary } from "@/types/health";

/**
 * Porta de entrada do sub-módulo Vida > Saúde (feature 060). Hoje mostra a próxima dose de
 * medicação — que já existe como tarefa com `is_medication` desde a 049 — e a próxima consulta
 * médica (`is_consultation`, feature 061). É onde as features 062 (água/alimentação), 063
 * (métricas e lembretes) e 064 (controle de medicamentos) penduram suas seções.
 */
export default function HealthDashboard() {
  const [summary, setSummary] = useState<HealthSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [medicationDialogOpen, setMedicationDialogOpen] = useState(false);
  const [consultationDialogOpen, setConsultationDialogOpen] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSummary(await loadHealthSummary());
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

  const nextDose = summary?.nextMedicationDose ?? null;
  const nextConsultation = summary?.nextConsultation ?? null;

  // O CTA do estado vazio de cada seção é o mesmo botão do header — só um dos dois aparece por vez,
  // por seção.
  return (
    <PageShell
      title="Saúde"
      eyebrow="Vida"
      description="Medicações e consultas"
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
