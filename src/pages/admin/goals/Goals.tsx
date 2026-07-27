import { Link } from "react-router-dom";
import { Target, Trash2, Wallet, Pen, RefreshCw, Repeat } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DatePicker } from "@/components/DatePicker";
import { EmptyState } from "@/components/EmptyState";
import { ModuleGuide, ModuleGuideButton } from "@/components/ModuleGuide";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import {
  FormLabel,
  FORM_DIALOG_CONTENT_CLASS,
  FORM_FIELDS_CLASS,
  ICON_EDIT_BUTTON_CLASS,
} from "@/components/FormLabel";
import { PageShell } from "@/components/PageShell";
import { TableLoadingSkeleton } from "@/components/TableLoadingSkeleton";
import {
  createGoal,
  deleteGoal,
  fetchGoals,
  sumGoalAporteFromLedger,
  updateGoal,
} from "@/api/goals";
import {
  createRecurringApi,
  fetchRecurringTransactions,
} from "@/api/recurring";
import { useClasses } from "@/hooks/database/useClasses";
import {
  GOAL_CATEGORY_LABELS,
  getGoalProgress,
  formatGoalProgress,
} from "@/domain/goals";
import {
  getFinancialGoalInsight,
  goalAporteDescription,
} from "@/domain/goals/finance";
import type { GoalCategory, PersonalGoal, PersonalGoalCreateRequest } from "@/types/goals";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { formatDateBR, formatBRL } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useState } from "react";

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

export default function Goals() {
  const [goals, setGoals] = useState<PersonalGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PersonalGoal | null>(null);
  const [form, setForm] = useState(emptyGoal());
  const [aporteGoal, setAporteGoal] = useState<PersonalGoal | null>(null);
  const [aporteClassId, setAporteClassId] = useState<number>(0);
  const [aporteDueDay, setAporteDueDay] = useState<number>(
    () => new Date().getDate()
  );
  const [aporteBusy, setAporteBusy] = useState(false);
  const { classes } = useClasses();
  const { toast } = useToast();

  const expenseClasses = useMemo(
    () =>
      classes.filter((c) =>
        /despesa/i.test(c.type?.nature?.name ?? "")
      ),
    [classes]
  );

  const load = useCallback(async () => {
    try {
      setGoals(await fetchGoals());
    } catch (error) {
      toast({ title: "Erro", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!aporteGoal) return;
    if (aporteClassId === 0 && expenseClasses[0]) {
      setAporteClassId(expenseClasses[0].id);
    }
  }, [aporteGoal, aporteClassId, expenseClasses]);

  function openEdit(goal: PersonalGoal) {
    setEditing(goal);
    setForm({ ...goal });
    setOpen(true);
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyGoal());
    setOpen(true);
  }

  async function handleSave() {
    if (!form.title.trim()) return;
    try {
      if (editing) await updateGoal({ id: editing.id, ...form });
      else await createGoal(form);
      toast({ title: "Meta salva!", duration: 2000 });
      setOpen(false);
      load();
    } catch (error) {
      toast({ title: "Erro", description: getErrorMessage(error), variant: "destructive" });
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteGoal(id);
      toast({ title: "Meta excluída", duration: 2000 });
      load();
    } catch (error) {
      toast({ title: "Erro", description: getErrorMessage(error), variant: "destructive" });
    }
  }

  async function handleSyncProgress(goal: PersonalGoal) {
    try {
      const summed = await sumGoalAporteFromLedger(goal.title);
      await updateGoal({
        id: goal.id,
        current_value: summed,
      });
      toast({
        title: "Progresso sincronizado",
        description: `${formatBRL(summed)} a partir dos aportes no ledger.`,
        duration: 2500,
      });
      load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    }
  }

  async function handleCreateMonthlyAporte() {
    if (!aporteGoal) return;
    const insight = getFinancialGoalInsight(aporteGoal);
    if (!insight?.monthlyTarget || insight.monthlyTarget <= 0) return;
    if (!aporteClassId) {
      toast({
        title: "Escolha uma classe",
        description: "Selecione a classe de despesa do aporte.",
        variant: "destructive",
      });
      return;
    }
    if (aporteDueDay < 1 || aporteDueDay > 31) {
      toast({
        title: "Dia inválido",
        description: "Informe o dia do mês (1–31).",
        variant: "destructive",
      });
      return;
    }

    setAporteBusy(true);
    try {
      const prefix = goalAporteDescription(aporteGoal.title);
      const existing = await fetchRecurringTransactions();
      const already = existing.find((r) =>
        r.description?.toLowerCase().startsWith(prefix.toLowerCase())
      );
      if (already) {
        toast({
          title: "Aporte já existe",
          description: "Há uma recorrência com essa descrição. Abra Parcelas para editar.",
        });
        setAporteGoal(null);
        return;
      }

      const months =
        insight.monthsRemaining != null && insight.monthsRemaining > 0
          ? insight.monthsRemaining
          : 12;

      await createRecurringApi({
        class_id: aporteClassId,
        value: Math.round(insight.monthlyTarget * 100) / 100,
        description: prefix,
        frequency: "Mensal",
        validity: null,
        due_day: aporteDueDay,
        installment_count: months,
        payment_start_date: new Date().toISOString().split("T")[0],
        status: true,
      });

      toast({
        title: "Aporte mensal criado",
        description: `${formatBRL(insight.monthlyTarget)} × ${months} meses em Parcelas.`,
        duration: 3000,
      });
      setAporteGoal(null);
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setAporteBusy(false);
    }
  }

  const activeGoals = goals.filter((g) => g.status === "active");

  return (
    <PageShell
      title="Metas Pessoais"
      description="Acompanhe seu progresso em objetivos de vida."
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {activeGoals.map((goal) => {
            const progress = getGoalProgress(goal);
            const financeInsight = getFinancialGoalInsight(goal);
            return (
              <article key={goal.id} className="rounded-xl border bg-card p-3.5 shadow-sm sm:p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Badge variant="outline" className="mb-2 text-[10px]">
                      {GOAL_CATEGORY_LABELS[goal.category]}
                    </Badge>
                    <h3 className="font-semibold">{goal.title}</h3>
                    {goal.description && (
                      <p className="mt-1 text-xs text-muted-foreground">{goal.description}</p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn("h-8 w-8", ICON_EDIT_BUTTON_CLASS)}
                      onClick={() => openEdit(goal)}
                    >
                      <Pen className="h-3.5 w-3.5" />
                    </Button>
                    <ConfirmDeleteDialog
                      title="Excluir esta meta?"
                      description="O progresso registrado será perdido."
                      onConfirm={() => handleDelete(goal.id)}
                    >
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </ConfirmDeleteDialog>
                  </div>
                </div>
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>{formatGoalProgress(goal)}</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn("h-full rounded-full bg-primary transition-all")}
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
                      Meta ↔ Finanças
                    </p>
                    {financeInsight.monthlyTarget != null &&
                    financeInsight.monthlyTarget > 0 ? (
                      <>
                        <p className="mt-1.5 text-sm font-semibold tabular-nums">
                          {formatBRL(financeInsight.monthlyTarget)}
                          <span className="font-normal text-muted-foreground">
                            {" "}
                            / mês
                          </span>
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {financeInsight.monthsRemaining === 1
                            ? "1 mês para bater a meta no prazo"
                            : `${financeInsight.monthsRemaining} meses para bater a meta no prazo`}
                        </p>
                      </>
                    ) : financeInsight.monthlyLabel ? (
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        {financeInsight.monthlyLabel}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {financeInsight.suggestion}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                      {financeInsight.monthlyTarget != null &&
                      financeInsight.monthlyTarget > 0 ? (
                        <>
                          <Button
                            variant="link"
                            className="h-auto p-0 text-xs"
                            onClick={() => {
                              setAporteClassId(expenseClasses[0]?.id ?? 0);
                              setAporteDueDay(new Date().getDate());
                              setAporteGoal(goal);
                            }}
                          >
                            <Repeat className="mr-1 h-3 w-3" />
                            Criar aporte mensal
                          </Button>
                          <Button
                            variant="link"
                            className="h-auto p-0 text-xs"
                            asChild
                          >
                            <Link
                              to={`/finance/transactions?new=1&desc=${encodeURIComponent(goalAporteDescription(goal.title))}&value=${financeInsight.monthlyTarget.toFixed(2)}`}
                            >
                              Lançar aporte do mês
                            </Link>
                          </Button>
                        </>
                      ) : null}
                      <Button
                        variant="link"
                        className="h-auto p-0 text-xs text-muted-foreground"
                        onClick={() => void handleSyncProgress(goal)}
                      >
                        <RefreshCw className="mr-1 h-3 w-3" />
                        Sincronizar progresso
                      </Button>
                      <Button
                        variant="link"
                        className="h-auto p-0 text-xs text-muted-foreground"
                        asChild
                      >
                        <Link to="/finance/transactions">Abrir transações</Link>
                      </Button>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar meta" : "Nova meta"}</DialogTitle>
          </DialogHeader>
          <div className={FORM_FIELDS_CLASS}>
            <div>
              <FormLabel required>Título</FormLabel>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div>
              <FormLabel optional>Descrição</FormLabel>
              <Input
                value={form.description ?? ""}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
            </div>
            <div>
              <FormLabel required>Categoria</FormLabel>
              <Select
                value={form.category}
                onValueChange={(v) =>
                  setForm({ ...form, category: v as GoalCategory })
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
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FormLabel required>Progresso atual</FormLabel>
                <Input
                  type="number"
                  value={form.current_value || ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      current_value: Number(e.target.value) || 0,
                    })
                  }
                  placeholder="Quanto já avançou"
                />
              </div>
              <div>
                <FormLabel required>Valor da meta</FormLabel>
                <Input
                  type="number"
                  value={form.target_value || ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      target_value: Number(e.target.value) || 0,
                    })
                  }
                  placeholder="Objetivo final"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FormLabel optional>Unidade</FormLabel>
                <Input
                  placeholder="R$, km, livros..."
                  value={form.unit ?? ""}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                />
              </div>
              <div>
                <FormLabel optional>Prazo</FormLabel>
                <DatePicker
                  date={
                    form.deadline
                      ? new Date(`${form.deadline}T12:00:00`)
                      : undefined
                  }
                  onSelect={(d) =>
                    setForm({
                      ...form,
                      deadline: d ? d.toISOString().split("T")[0] : null,
                    })
                  }
                />
              </div>
            </div>
            <Button onClick={handleSave} className="w-full">
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!aporteGoal}
        onOpenChange={(next) => {
          if (!next) setAporteGoal(null);
        }}
      >
        <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
          <DialogHeader>
            <DialogTitle>Criar aporte mensal</DialogTitle>
          </DialogHeader>
          {aporteGoal ? (
            <div className={FORM_FIELDS_CLASS}>
              <p className="text-sm text-muted-foreground">
                Gera uma recorrência em Parcelas com a descrição{" "}
                <span className="font-medium text-foreground">
                  {goalAporteDescription(aporteGoal.title)}
                </span>
                . Ao pagar as parcelas (ou lançar aportes), use “Sincronizar
                progresso”.
              </p>
              <div>
                <FormLabel required>Classe (despesa)</FormLabel>
                <Select
                  value={aporteClassId ? String(aporteClassId) : ""}
                  onValueChange={(v) => setAporteClassId(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {expenseClasses.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.type?.name ? `${c.type.name} · ` : ""}
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <FormLabel required>Dia do vencimento</FormLabel>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={aporteDueDay}
                  onChange={(e) =>
                    setAporteDueDay(Number(e.target.value) || 1)
                  }
                />
              </div>
              <Button
                onClick={() => void handleCreateMonthlyAporte()}
                disabled={aporteBusy || expenseClasses.length === 0}
                className="w-full"
              >
                {aporteBusy ? "Criando…" : "Criar recorrência"}
              </Button>
              {expenseClasses.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Cadastre uma classe de despesa em Finanças para continuar.
                </p>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
