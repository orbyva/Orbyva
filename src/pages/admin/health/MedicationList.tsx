import { useCallback, useEffect, useMemo, useState } from "react";
import { Pill } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { EmptyState } from "@/components/EmptyState";
import { PageShell } from "@/components/PageShell";
import { PAGE_HEADER_ACTIONS_CLASS } from "@/components/FormLabel";
import { TableLoadingSkeleton } from "@/components/TableLoadingSkeleton";
import { MedicationQuickCreateDialog } from "@/pages/admin/health/MedicationQuickCreateDialog";
import { ReminderPreferencesDialog } from "@/pages/admin/life/ReminderPreferencesDialog";
import {
  deactivateMedication,
  fetchDosesSince,
  fetchMedications,
} from "@/api/health/medications";
import { fetchReminderPreferences } from "@/api/health";
import { computeAdherence, formatRate } from "@/domain/health/adherence";
import { formatPosology, nextDoseSlot } from "@/domain/health/medication";
import { formatDateBR } from "@/lib/currency";
import { formatLocalIsoDate } from "@/lib/dates";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/hooks/use-toast";
import type { Medication, ReminderPreference } from "@/types/health";
import type { Task } from "@/types/tasks";

/** Janela da adesão exibida na lista. */
const ADHERENCE_DAYS = 30;

function windowStart(days: number): string {
  const start = new Date();
  start.setDate(start.getDate() - days);
  return formatLocalIsoDate(start);
}

/** `HH:MM` do relógio local — a régua de "o que ainda falta hoje" em `nextDoseSlot`. */
function clockTime(now: Date): string {
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

/** "hoje às 20:00", "amanhã às 08:00" ou "22/08 às 08:00" — a próxima dose em uma linha. */
function formatNextDose(date: string, time: string, today: string): string {
  const amanha = new Date(`${today}T12:00:00`);
  amanha.setDate(amanha.getDate() + 1);
  const quando =
    date === today
      ? "hoje"
      : date === formatLocalIsoDate(amanha)
        ? "amanhã"
        : formatDateBR(date);
  return `Próxima dose: ${quando} às ${time}`;
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
  const [reminderDialogOpen, setReminderDialogOpen] = useState(false);
  const [reminderPreferences, setReminderPreferences] = useState<ReminderPreference[]>([]);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, recentDoses, preferences] = await Promise.all([
        fetchMedications(),
        fetchDosesSince(windowStart(ADHERENCE_DAYS)),
        // Feature 071: o atalho "Lembretes" da 063 passa a existir também aqui, e não só no
        // cabeçalho do dashboard — quem cuida do tratamento é esta tela.
        fetchReminderPreferences(),
      ]);
      setMedications(rows);
      setDoses(recentDoses);
      setReminderPreferences(preferences);
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

  /**
   * Feature 071: a próxima dose prevista de cada tratamento, em uma linha. É o que a lista devia
   * responder sem abrir o calendário — "quando eu tomo de novo?".
   */
  const nextDoseLabelById = useMemo(() => {
    const now = new Date();
    const today = formatLocalIsoDate(now);
    const nowTime = clockTime(now);
    const entries = medications.map((medication) => {
      const slot = nextDoseSlot(medication, today, nowTime);
      return [
        medication.id,
        slot ? formatNextDose(slot.date, slot.time, today) : null,
      ] as const;
    });
    return new Map(entries);
  }, [medications]);

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
          {/* Feature 071: "Lembretes" (063) sempre visível, como no dashboard — quem administra o
              tratamento está aqui, e o alerta da dose é parte do controle. */}
          <Button variant="outline" onClick={() => setReminderDialogOpen(true)}>
            Lembretes
          </Button>
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
              const nextDose = nextDoseLabelById.get(medication.id) ?? null;
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
                    {nextDose ? (
                      <p
                        className="text-xs text-muted-foreground"
                        data-testid={`next-dose-${medication.id}`}
                      >
                        {nextDose}
                      </p>
                    ) : null}
                    {medication.instructions ? (
                      <p className="text-xs text-muted-foreground">
                        {medication.instructions}
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

      <ReminderPreferencesDialog
        open={reminderDialogOpen}
        onOpenChange={setReminderDialogOpen}
        preferences={reminderPreferences}
        onSaved={load}
      />
    </PageShell>
  );
}
