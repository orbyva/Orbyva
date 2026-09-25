import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Pill } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { EmptyState } from "@/components/EmptyState";
import { PageShell } from "@/components/PageShell";
import { PAGE_HEADER_ACTIONS_CLASS } from "@/components/FormLabel";
import { TableLoadingSkeleton } from "@/components/TableLoadingSkeleton";
import { MedicationQuickCreateDialog } from "@/pages/admin/health/MedicationQuickCreateDialog";
import {
  deactivateMedication,
  fetchDosesSince,
  fetchMedications,
} from "@/api/health/medications";
import { computeAdherence, formatRate } from "@/domain/health/adherence";
import { formatPosology, nextDoseSlot } from "@/domain/health/medication";
import { formatDateBR } from "@/lib/currency";
import { formatLocalIsoDate } from "@/lib/dates";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/hooks/use-toast";
import type { Medication } from "@/types/health";
import type { Task } from "@/types/tasks";

/** Janela da adesão exibida na lista. */
const ADHERENCE_DAYS = 30;

function windowStart(days: number): string {
  const start = new Date();
  start.setDate(start.getDate() - days);
  return formatLocalIsoDate(start);
}

/**
 * Lista de tratamentos medicamentosos (feature 064) — a tela que a 049 não tinha, porque lá a
 * medicação não existia como entidade: era uma tarefa recorrente perdida no meio das outras.
 *
 * A adesão dos últimos 30 dias é **calculada** a partir das doses (`computeAdherence`), nunca lida
 * de uma coluna: guardar o número exigiria recalculá-lo a cada marcação e ele ficaria
 * dessincronizado no primeiro erro.
 */
export default function MedicationList() {
  const [medications, setMedications] = useState<Medication[]>([]);
  const [doses, setDoses] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Medication | null>(null);
  const [endingId, setEndingId] = useState<string | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, recentDoses] = await Promise.all([
        fetchMedications(),
        fetchDosesSince(windowStart(ADHERENCE_DAYS)),
      ]);
      setMedications(rows);
      setDoses(recentDoses);
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(
          error,
          "Não foi possível carregar as medicações."
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

  /** Adesão por tratamento, das doses da janela. Uma passada só sobre a lista de doses. */
  const adherenceById = useMemo(() => {
    const byMedication = new Map<string, Task[]>();
    for (const dose of doses) {
      if (!dose.medication_id) continue;
      const list = byMedication.get(dose.medication_id) ?? [];
      list.push(dose);
      byMedication.set(dose.medication_id, list);
    }
    const now = new Date();
    return new Map(
      [...byMedication].map(([id, list]) => [id, computeAdherence(list, now)])
    );
  }, [doses]);

  // Ativos primeiro: um tratamento encerrado continua na lista pelo histórico, mas não é o que a
  // pessoa vem ver.
  const ordered = useMemo(
    () =>
      [...medications].sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1;
        return a.name.localeCompare(b.name, "pt-BR");
      }),
    [medications]
  );

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(medication: Medication) {
    setEditing(medication);
    setDialogOpen(true);
  }

  async function handleDeactivate(medication: Medication) {
    setEndingId(medication.id);
    try {
      await deactivateMedication(medication.id);
      toast({ title: "Tratamento encerrado.", duration: 2000 });
      await load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(
          error,
          "Não foi possível encerrar o tratamento."
        ),
        variant: "destructive",
      });
    } finally {
      setEndingId(null);
    }
  }

  return (
    <PageShell
      title="Medicações"
      eyebrow="Vida · Saúde"
      description="Tratamentos, posologia e adesão dos últimos 30 dias"
      actions={
        <div className={PAGE_HEADER_ACTIONS_CLASS}>
          {ordered.length > 0 ? (
            <Button onClick={openCreate}>Nova medicação</Button>
          ) : null}
        </div>
      }
    >
      <section className="rounded-xl border bg-card shadow-sm">
        {loading ? (
          <TableLoadingSkeleton rows={3} columns={3} />
        ) : ordered.length === 0 ? (
          <EmptyState
            icon={Pill}
            title="Nenhuma medicação cadastrada"
            description="Cadastre um tratamento com seus horários para acompanhar as doses no calendário e a adesão por aqui."
            action={<Button onClick={openCreate}>Nova medicação</Button>}
          />
        ) : (
          <ul className="divide-y">
            {ordered.map((medication) => {
              const adherence = adherenceById.get(medication.id);
              const next = nextDoseSlot(medication, new Date());
              return (
                <li
                  key={medication.id}
                  aria-label={medication.name}
                  className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium">{medication.name}</p>
                      {medication.active ? null : (
                        <Badge variant="secondary">Encerrado</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatPosology(medication)}
                    </p>
                    {medication.instructions ? (
                      <p className="text-xs text-muted-foreground">
                        {medication.instructions}
                      </p>
                    ) : null}
                    {/* O vínculo remédio → tarefa aparecendo onde o remédio é gerenciado: a dose
                        é uma tarefa na agenda, e daqui dá para ir vê-la. Tratamento encerrado não
                        tem próxima dose — prometer uma seria mentira. */}
                    {next ? (
                      <p
                        className="text-xs text-muted-foreground"
                        data-testid={`next-dose-${medication.id}`}
                      >
                        Próxima dose: {formatDateBR(next.date)} às {next.time}
                      </p>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                      {/* A adesão só existe se houve dose vencida na janela — "0%" para quem
                          acabou de cadastrar seria uma acusação falsa. */}
                      {adherence && adherence.total > 0 ? (
                        <span data-testid={`adherence-${medication.id}`}>
                          Adesão 30 dias: {formatRate(adherence.takenRate)} (
                          {adherence.taken} de {adherence.total}) ·{" "}
                          {formatRate(adherence.onTimeRate)} no horário
                        </span>
                      ) : (
                        <span>Sem doses vencidas nos últimos 30 dias</span>
                      )}
                    </p>
                    {medication.ended_on ? (
                      <p className="text-xs text-muted-foreground">
                        Término: {formatDateBR(medication.ended_on)}
                      </p>
                    ) : null}
                    <Link
                      to="/tasks/agenda"
                      aria-label={`Ver doses de ${medication.name} na agenda`}
                      className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                    >
                      Ver doses na agenda
                    </Link>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEdit(medication)}
                    >
                      Editar
                    </Button>
                    {medication.active ? (
                      <ConfirmDeleteDialog
                        title={`Encerrar ${medication.name}?`}
                        description="O tratamento para de gerar doses novas. As doses já registradas e o histórico continuam onde estão."
                        confirmLabel="Encerrar"
                        loading={endingId === medication.id}
                        onConfirm={() => handleDeactivate(medication)}
                      >
                        <Button variant="outline" size="sm">
                          Encerrar
                        </Button>
                      </ConfirmDeleteDialog>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* `key` remonta o dialog a cada alvo: os campos são estado local inicializado do
          `medication`, então sem isto editar um tratamento depois do outro mostraria os campos do
          anterior. */}
      <MedicationQuickCreateDialog
        key={editing?.id ?? "novo"}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={load}
        medication={editing}
      />
    </PageShell>
  );
}
