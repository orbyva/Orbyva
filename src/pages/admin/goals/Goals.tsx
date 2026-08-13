import { Link, useSearchParams } from "react-router-dom";
import { Target, Trash2, Wallet, Pen, Plus, Repeat, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { DatePicker } from "@/components/DatePicker";
import { formatLocalIsoDate } from "@/lib/dates";
import { EmptyState } from "@/components/EmptyState";
import { ModuleGuide, ModuleGuideButton } from "@/components/ModuleGuide";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { MoneyInput } from "@/components/MoneyInput";
import { FormField, FormFieldRow } from "@/components/FormField";
import {
  FormDialogShell,
  FormFooter,
} from "@/components/FormDialogShell";
import { FormSection } from "@/components/FormSection";
import { ICON_EDIT_BUTTON_CLASS } from "@/components/FormLabel";
import { PageShell } from "@/components/PageShell";
import { TableLoadingSkeleton } from "@/components/TableLoadingSkeleton";
import {
  createGoal,
  deleteGoal,
  fetchGoals,
  sumGoalAporteFromLedger,
  updateGoal,
} from "@/api/goals";
import { createTransactionApi, fetchValueByNatureForMonth } from "@/api/finance";
import {
  createRecurringApi,
  fetchRecurringTransactions,
} from "@/api/recurring";
import {
  GOAL_CATEGORY_LABELS,
  getGoalProgress,
  formatGoalProgress,
} from "@/domain/goals";
import {
  buildGoalInstallmentDraft,
  clampGoalApplyAmount,
  evaluateGoalAgainstSurplus,
  getFinancialGoalInsight,
  goalApplyPresets,
  goalMetaClassName,
  initialGoalInstallmentFields,
  installmentsToCoverRemaining,
  maxGoalApplyAmount,
  resolveSyncedGoalProgress,
} from "@/domain/goals/finance";
import { ensureGoalMetaClass } from "@/domain/goals/poupanca";
import type { GoalCategory, PersonalGoal, PersonalGoalCreateRequest } from "@/types/goals";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { formatDateBR, formatBRL } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { memo, useCallback, useEffect, useMemo, useState } from "react";

const emptyGoal = (): PersonalGoalCreateRequest => ({
  title: "",
  description: "",
  category: "other",
  target_value: 0,
  current_value: 0,
  unit: "",
  deadline: null,
  status: "active",
});

const GoalsGrid = memo(function GoalsGrid({
  goals,
  monthSurplus,
  onEdit,
  onDelete,
  onDestinar,
  onRoutine,
  onSyncFromLedger,
}: {
  goals: PersonalGoal[];
  monthSurplus: number | null;
  onEdit: (goal: PersonalGoal) => void;
  onDelete: (id: string) => void | Promise<void>;
  onDestinar: (goal: PersonalGoal) => void;
  onRoutine: (goal: PersonalGoal) => void;
  onSyncFromLedger: (goal: PersonalGoal) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {goals.map((goal) => {
        const progress = getGoalProgress(goal);
        const financeInsight = getFinancialGoalInsight(goal);
        const surplusFit =
          monthSurplus != null
            ? evaluateGoalAgainstSurplus(goal, monthSurplus)
            : null;
        const canDestinar =
          !!surplusFit &&
          surplusFit.remaining > 0 &&
          maxGoalApplyAmount(surplusFit.remaining, surplusFit.surplus) > 0;
        const canRoutine = !!financeInsight && financeInsight.remaining > 0;

        return (
          <article
            key={goal.id}
            className="rounded-xl border bg-card p-3.5 shadow-sm sm:p-5"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <Badge variant="outline" className="mb-2 text-[10px]">
                  {GOAL_CATEGORY_LABELS[goal.category]}
                </Badge>
                <h3 className="font-semibold">{goal.title}</h3>
                {goal.description && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {goal.description}
                  </p>
                )}
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn("h-8 w-8", ICON_EDIT_BUTTON_CLASS)}
                  onClick={() => onEdit(goal)}
                >
                  <Pen className="h-3.5 w-3.5" />
                </Button>
                <ConfirmDeleteDialog
                  title="Excluir esta meta?"
                  description="O progresso registrado será perdido."
                  onConfirm={() => onDelete(goal.id)}
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </ConfirmDeleteDialog>
              </div>
            </div>
            <div className="mt-4">
              <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                <span>{formatGoalProgress(goal)}</span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
            {goal.deadline && (
              <p className="mt-2 text-xs text-muted-foreground">
                Prazo: {formatDateBR(goal.deadline)}
              </p>
            )}
            {financeInsight ? (
              <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-2.5">
                <p className="flex items-center gap-1.5 text-xs font-medium">
                  <Wallet className="h-3.5 w-3.5" />
                  Meta ← saldo do mês
                </p>
                {financeInsight.monthlyTarget != null &&
                financeInsight.monthlyTarget > 0 ? (
                  <p className="mt-1.5 text-sm font-semibold tabular-nums">
                    {formatBRL(financeInsight.monthlyTarget)}
                    <span className="font-normal text-muted-foreground">
                      {" "}
                      / mês no prazo
                    </span>
                  </p>
                ) : financeInsight.monthlyLabel ? (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {financeInsight.monthlyLabel}
                  </p>
                ) : null}

                {surplusFit ? (
                  <p
                    className={cn(
                      "mt-1.5 text-xs",
                      surplusFit.status === "comfortable" ||
                        surplusFit.status === "exact"
                        ? "text-foreground"
                        : "text-muted-foreground"
                    )}
                  >
                    {surplusFit.summary}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {financeInsight.suggestion}
                  </p>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                  {canDestinar ? (
                    <Button
                      variant="link"
                      className="h-auto p-0 text-xs"
                      onClick={() => onDestinar(goal)}
                    >
                      <Plus className="mr-1 h-3 w-3" />
                      Destinar valor à meta
                    </Button>
                  ) : null}
                  {canRoutine ? (
                    <Button
                      variant="link"
                      className="h-auto p-0 text-xs"
                      onClick={() => onRoutine(goal)}
                    >
                      <Repeat className="mr-1 h-3 w-3" />
                      Rotina em Recorrências (meta)
                    </Button>
                  ) : null}
                  <Button
                    variant="link"
                    className="h-auto p-0 text-xs text-muted-foreground"
                    onClick={() => void onSyncFromLedger(goal)}
                  >
                    <RefreshCw className="mr-1 h-3 w-3" />
                    Sincronizar dos lançamentos
                  </Button>
                  <Button
                    variant="link"
                    className="h-auto p-0 text-xs text-muted-foreground"
                    asChild
                  >
                    <Link to="/finance/dashboard">Ver saldo em Finanças</Link>
                  </Button>
                </div>
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
});

function GoalFormDialog({
  open,
  seed,
  editing,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  seed: PersonalGoalCreateRequest;
  editing: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (form: PersonalGoalCreateRequest) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState(seed);

  useEffect(() => {
    if (open) setDraft(seed);
  }, [open, seed]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <FormDialogShell
        title={editing ? "Editar meta" : "Nova meta"}
        description="Defina o objetivo e acompanhe o progresso."
        footer={
          <FormFooter
            onCancel={() => onOpenChange(false)}
            onSubmit={() => void onSave(draft)}
            submitLabel={editing ? "Salvar alterações" : "Criar meta"}
          />
        }
      >
        <FormSection title="Essencial">
          <FormField label="Título" required>
            <Input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </FormField>
          <FormField label="Descrição" optional>
            <Input
              value={draft.description ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value })
              }
            />
          </FormField>
          <FormField label="Categoria" required>
            <Select
              value={draft.category}
              onValueChange={(v) =>
                setDraft({ ...draft, category: v as GoalCategory })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(GOAL_CATEGORY_LABELS).map(([k, l]) => (
                  <SelectItem key={k} value={k}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        </FormSection>
        <FormSection title="Progresso">
          <FormFieldRow>
            <FormField label="Progresso atual" required>
              <Input
                type="number"
                value={draft.current_value || ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    current_value: Number(e.target.value) || 0,
                  })
                }
                placeholder="Quanto já avançou"
              />
            </FormField>
            <FormField label="Valor da meta" required>
              <Input
                type="number"
                value={draft.target_value || ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    target_value: Number(e.target.value) || 0,
                  })
                }
                placeholder="Objetivo final"
              />
            </FormField>
          </FormFieldRow>
          <FormFieldRow>
            <FormField label="Unidade" optional>
              <Input
                placeholder="R$, km, livros..."
                value={draft.unit ?? ""}
                onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
              />
            </FormField>
            <FormField label="Prazo" optional>
              <DatePicker
                clearable
                date={
                  draft.deadline
                    ? new Date(`${draft.deadline}T12:00:00`)
                    : undefined
                }
                onSelect={(d) =>
                  setDraft({
                    ...draft,
                    deadline: d ? formatLocalIsoDate(d) : null,
                  })
                }
              />
            </FormField>
          </FormFieldRow>
        </FormSection>
      </FormDialogShell>
    </Dialog>
  );
}

export default function Goals() {
  const [goals, setGoals] = useState<PersonalGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PersonalGoal | null>(null);
  const [form, setForm] = useState(emptyGoal());
  const [monthSurplus, setMonthSurplus] = useState<number | null>(null);
  const [poupancaGoal, setPoupancaGoal] = useState<PersonalGoal | null>(null);
  const [poupancaDueDay, setPoupancaDueDay] = useState(() => new Date().getDate());
  const [poupancaBusy, setPoupancaBusy] = useState(false);
  const [routineMonthly, setRoutineMonthly] = useState<number | "">("");
  const [destinarGoal, setDestinarGoal] = useState<PersonalGoal | null>(null);
  const [destinarAmount, setDestinarAmount] = useState<number | "">("");
  const [destinarBusy, setDestinarBusy] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();

  const destinarFit = useMemo(() => {
    if (!destinarGoal || monthSurplus == null) return null;
    return evaluateGoalAgainstSurplus(destinarGoal, monthSurplus);
  }, [destinarGoal, monthSurplus]);

  const destinarPresets = useMemo(
    () => (destinarFit ? goalApplyPresets(destinarFit) : []),
    [destinarFit]
  );

  const destinarMax = useMemo(() => {
    if (!destinarFit) return 0;
    return maxGoalApplyAmount(destinarFit.remaining, destinarFit.surplus);
  }, [destinarFit]);

  const load = useCallback(async () => {
    try {
      const now = new Date();
      const [list, month] = await Promise.all([
        fetchGoals(),
        fetchValueByNatureForMonth(
          now.getFullYear(),
          now.getMonth() + 1
        ).catch(() => null),
      ]);
      setGoals(list);
      if (month) {
        setMonthSurplus(
          Number(month.receita_total || 0) - Number(month.despesa_total || 0)
        );
      } else {
        setMonthSurplus(null);
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível atualizar a meta."),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    setEditing(null);
    setForm(emptyGoal());
    setOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete("new");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const openEdit = useCallback((goal: PersonalGoal) => {
    setEditing(goal);
    setForm({ ...goal });
    setOpen(true);
  }, []);

  const openCreate = useCallback(() => {
    setEditing(null);
    setForm(emptyGoal());
    setOpen(true);
  }, []);

  const handleSaveFromDialog = useCallback(
    async (formData: PersonalGoalCreateRequest) => {
      if (!formData.title.trim()) return;
      try {
        if (editing) await updateGoal({ id: editing.id, ...formData });
        else await createGoal(formData);
        toast({ title: "Meta salva!", duration: 2000 });
        setOpen(false);
        load();
      } catch (error) {
        toast({
          title: "Erro",
          description: getErrorMessage(error, "Não foi possível atualizar a meta."),
          variant: "destructive",
        });
      }
    },
    [editing, toast, load]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteGoal(id);
        toast({ title: "Meta excluída", duration: 2000 });
        load();
      } catch (error) {
        toast({
          title: "Erro",
          description: getErrorMessage(error, "Não foi possível atualizar a meta."),
          variant: "destructive",
        });
      }
    },
    [toast, load]
  );

  const openDestinar = useCallback(
    (goal: PersonalGoal) => {
      if (monthSurplus == null) return;
      const fit = evaluateGoalAgainstSurplus(goal, monthSurplus);
      if (!fit || fit.remaining <= 0) return;
      const initial =
        fit.applyAmount > 0
          ? fit.applyAmount
          : maxGoalApplyAmount(fit.remaining, fit.surplus);
      setDestinarGoal(goal);
      setDestinarAmount(initial > 0 ? initial : "");
    },
    [monthSurplus]
  );

  async function handleDestinarConfirm() {
    if (!destinarGoal || !destinarFit || monthSurplus == null) return;
    const amount = clampGoalApplyAmount(
      Number(destinarAmount) || 0,
      destinarFit.remaining,
      destinarFit.surplus
    );
    if (amount <= 0) {
      toast({
        title: "Valor inválido",
        description: `Informe um valor entre R$ 0,01 e ${formatBRL(destinarMax)}.`,
        variant: "destructive",
      });
      return;
    }

    setDestinarBusy(true);
    try {
      const classId = await ensureGoalMetaClass(destinarGoal.title);
      const label = goalMetaClassName(destinarGoal.title);
      const result = await createTransactionApi({
        class_id: classId,
        value: amount,
        description: label,
        transaction_at: new Date().toISOString(),
      });

      const next =
        Math.round((destinarGoal.current_value + amount) * 100) / 100;
      await updateGoal({
        id: destinarGoal.id,
        current_value: Math.min(destinarGoal.target_value, next),
      });

      toast({
        title: result.queued
          ? "Aporte enfileirado (offline)"
          : "Aporte destinado à meta",
        description: `${formatBRL(amount)} em Meta · ${destinarGoal.title.trim()}. Saldo restante estimado: ${formatBRL(Math.max(0, monthSurplus - amount))}.`,
        duration: 3500,
      });
      setDestinarGoal(null);
      load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível atualizar a meta."),
        variant: "destructive",
      });
    } finally {
      setDestinarBusy(false);
    }
  }

  const handleSyncFromLedger = useCallback(
    async (goal: PersonalGoal) => {
      try {
        const summed = await sumGoalAporteFromLedger(goal.title);
        const resolved = resolveSyncedGoalProgress(
          goal.current_value,
          summed,
          goal.target_value
        );

        if (!resolved.foundLedger) {
          toast({
            title: "Nenhum aporte nos lançamentos",
            description:
              "Não achei lançamentos desta meta, o progresso foi mantido.",
            duration: 3200,
          });
          return;
        }

        if (resolved.changed) {
          await updateGoal({
            id: goal.id,
            current_value: resolved.next,
          });
        }

        toast({
          title: "Progresso sincronizado",
          description: `${formatBRL(resolved.next)} a partir dos aportes nos lançamentos.`,
          duration: 2800,
        });
        load();
      } catch (error) {
        toast({
          title: "Erro",
          description: getErrorMessage(error, "Não foi possível atualizar a meta."),
          variant: "destructive",
        });
      }
    },
    [toast, load]
  );

  const routineDraft = useMemo(() => {
    if (!poupancaGoal) return null;
    const insight = getFinancialGoalInsight(poupancaGoal);
    const remaining =
      insight?.remaining ??
      Math.max(0, poupancaGoal.target_value, poupancaGoal.current_value);
    const monthly = Number(routineMonthly) || 0;
    const installments = installmentsToCoverRemaining(remaining, monthly);
    return buildGoalInstallmentDraft(remaining, monthly, installments);
  }, [poupancaGoal, routineMonthly]);

  const openRoutine = useCallback((goal: PersonalGoal) => {
    const fields = initialGoalInstallmentFields(goal);
    setPoupancaDueDay(new Date().getDate());
    setRoutineMonthly(fields.monthlyAmount > 0 ? fields.monthlyAmount : "");
    setPoupancaGoal(goal);
  }, []);

  async function handleCreatePoupançaRoutine() {
    if (!poupancaGoal || !routineDraft) return;
    const monthly = routineDraft.monthlyAmount;
    const months = routineDraft.installments;
    if (monthly <= 0 || months <= 0) {
      toast({
        title: "Plano incompleto",
        description: "Informe o valor mensal e a quantidade de parcelas.",
        variant: "destructive",
      });
      return;
    }
    if (poupancaDueDay < 1 || poupancaDueDay > 31) {
      toast({
        title: "Dia inválido",
        description: "Informe o dia do mês (1–31).",
        variant: "destructive",
      });
      return;
    }

    setPoupancaBusy(true);
    try {
      const classId = await ensureGoalMetaClass(poupancaGoal.title);
      const prefix = goalMetaClassName(poupancaGoal.title);
      const existing = await fetchRecurringTransactions();
      const already = existing.find(
        (r) =>
          ((r.description || "").toLowerCase().startsWith(prefix.toLowerCase()) ||
            (r.class?.name || "").toLowerCase() === prefix.toLowerCase()) &&
          r.status
      );
      if (already) {
        toast({
          title: "Rotina já existe",
          description: "Há uma recorrência com essa descrição em Recorrências.",
        });
        setPoupancaGoal(null);
        return;
      }

      await createRecurringApi({
        class_id: classId,
        value: monthly,
        description: prefix,
        frequency: "Mensal",
        validity: null,
        due_day: poupancaDueDay,
        installment_count: months,
        payment_start_date: new Date().toISOString().split("T")[0],
        status: true,
      });

      toast({
        title: "Rotina de investimento criada",
        description: `${formatBRL(monthly)} × ${months} em Recorrências (categoria Meta · ${poupancaGoal.title.trim()}).`,
        duration: 3500,
      });
      setPoupancaGoal(null);
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível atualizar a meta."),
        variant: "destructive",
      });
    } finally {
      setPoupancaBusy(false);
    }
  }

  const activeGoals = useMemo(
    () => goals.filter((g) => g.status === "active"),
    [goals]
  );

  return (
    <PageShell
      title="Metas Pessoais"
      description={
        monthSurplus != null
          ? `Saldo deste mês nos lançamentos: ${formatBRL(monthSurplus)}, destino natural das metas financeiras.`
          : "Acompanhe seu progresso em objetivos de vida."
      }
      actions={
        <>
          <ModuleGuideButton moduleId="goals" />
          <Button onClick={openCreate}>Nova meta</Button>
        </>
      }
    >
      <ModuleGuide moduleId="goals" />
      {loading ? (
        <TableLoadingSkeleton rows={6} />
      ) : activeGoals.length === 0 ? (
        <EmptyState
          icon={Target}
          title="Nenhuma meta ativa"
          description="Crie sua primeira meta pessoal."
          action={<Button onClick={openCreate}>Nova meta</Button>}
        />
      ) : (
        <GoalsGrid
          goals={activeGoals}
          monthSurplus={monthSurplus}
          onEdit={openEdit}
          onDelete={handleDelete}
          onDestinar={openDestinar}
          onRoutine={openRoutine}
          onSyncFromLedger={handleSyncFromLedger}
        />
      )}

      <GoalFormDialog
        open={open}
        seed={form}
        editing={!!editing}
        onOpenChange={setOpen}
        onSave={handleSaveFromDialog}
      />

      <Dialog
        open={!!destinarGoal}
        onOpenChange={(next) => {
          if (!next) setDestinarGoal(null);
        }}
      >
        <FormDialogShell
          title="Destinar valor à meta"
          description="Registra um aporte em Investimento · Meta e atualiza o progresso."
          footer={
            <FormFooter
              onCancel={() => setDestinarGoal(null)}
              onSubmit={() => void handleDestinarConfirm()}
              submitLabel={
                destinarBusy ? "Destinando…" : "Destinar e registrar lançamento"
              }
              loading={destinarBusy}
              submitDisabled={destinarMax <= 0}
            />
          }
        >
          {destinarGoal && destinarFit ? (
            <FormSection title="Aporte">
              <p className="text-sm text-muted-foreground">
                Subcategoria{" "}
                <span className="font-medium text-foreground">
                  {destinarGoal.title.trim()}
                </span>{" "}
                (descrição{" "}
                <span className="font-medium text-foreground">
                  {goalMetaClassName(destinarGoal.title)}
                </span>
                ).
              </p>
              <p className="text-xs text-muted-foreground">
                Saldo do mês:{" "}
                <span className="font-medium text-foreground tabular-nums">
                  {formatBRL(destinarFit.surplus)}
                </span>
                {" · "}
                Falta na meta:{" "}
                <span className="font-medium text-foreground tabular-nums">
                  {formatBRL(destinarFit.remaining)}
                </span>
                {" · "}
                Máximo agora:{" "}
                <span className="font-medium text-foreground tabular-nums">
                  {formatBRL(destinarMax)}
                </span>
              </p>
              <FormField label="Valor do aporte" required>
                <MoneyInput
                  value={destinarAmount}
                  onChange={setDestinarAmount}
                  placeholder="0,00"
                />
              </FormField>
              {destinarPresets.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {destinarPresets.map((preset) => (
                    <Button
                      key={preset.id}
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() => setDestinarAmount(preset.amount)}
                    >
                      {preset.label} · {formatBRL(preset.amount)}
                    </Button>
                  ))}
                </div>
              ) : null}
            </FormSection>
          ) : null}
        </FormDialogShell>
      </Dialog>

      <Dialog
        open={!!poupancaGoal}
        onOpenChange={(next) => {
          if (!next) setPoupancaGoal(null);
        }}
      >
        <FormDialogShell
          title="Rotina em Recorrências (Meta)"
          description="Planeje aportes mensais até fechar a falta da meta."
          footer={
            <FormFooter
              onCancel={() => setPoupancaGoal(null)}
              onSubmit={() => void handleCreatePoupançaRoutine()}
              submitLabel={
                poupancaBusy ? "Criando…" : "Criar em recorrências"
              }
              loading={poupancaBusy}
              submitDisabled={
                !routineDraft ||
                routineDraft.monthlyAmount <= 0 ||
                routineDraft.installments <= 0
              }
            />
          }
        >
          {poupancaGoal && routineDraft ? (
            <FormSection title="Planejamento">
              <p className="text-sm text-muted-foreground">
                Falta atual:{" "}
                <span className="font-medium text-foreground">
                  {formatBRL(routineDraft.remaining)}
                </span>
                {" · "}
                Meta · {poupancaGoal.title.trim()} (
                {goalMetaClassName(poupancaGoal.title)})
              </p>
              <FormFieldRow>
                <FormField label="Valor planejado / mês" required>
                  <MoneyInput
                    value={routineMonthly}
                    onChange={setRoutineMonthly}
                    placeholder="0,00"
                  />
                </FormField>
                <FormField label="Dia do vencimento" required>
                  <Input
                    type="number"
                    min={1}
                    max={31}
                    value={poupancaDueDay}
                    onChange={(e) =>
                      setPoupancaDueDay(Number(e.target.value) || 1)
                    }
                  />
                </FormField>
              </FormFieldRow>
              {routineDraft.monthlyAmount > 0 ? (
                <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                  <span className="font-medium tabular-nums">
                    {routineDraft.installments} parcela
                    {routineDraft.installments === 1 ? "" : "s"}
                  </span>{" "}
                  de{" "}
                  <span className="font-medium tabular-nums">
                    {formatBRL(routineDraft.monthlyAmount)}
                  </span>
                  <span className="text-muted-foreground">
                    {" "}
                    · total {formatBRL(routineDraft.total)}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {routineDraft.summary}
                  </span>
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Informe o valor mensal para calcular as parcelas pela falta da
                  meta.
                </p>
              )}
              <Button variant="link" className="h-auto p-0 text-xs" asChild>
                <Link to="/finance/recurring">Abrir Recorrências</Link>
              </Button>
            </FormSection>
          ) : null}
        </FormDialogShell>
      </Dialog>
    </PageShell>
  );
}
