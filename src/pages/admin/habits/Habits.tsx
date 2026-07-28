import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Flame, Trash2, Check, Pen, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  createHabit,
  deleteHabit,
  fetchAllHabitLogs,
  fetchHabits,
  toggleHabitLog,
  updateHabit,
} from "@/api/habits";
import { fetchGoals } from "@/api/goals";
import {
  calculateStreak,
  frequencyLabel,
  getWeekProgress,
  getWeekStrip,
  isAvoidHabit,
  isCompletedToday,
  buildHabitMonthHeatmap,
  buildOverallMonthHeatmap,
  shiftMonth,
} from "@/domain/habits";
import { getHabitInsights } from "@/domain/habits/insights";
import type { Habit, HabitCreateRequest, HabitKind } from "@/types/habits";
import type { PersonalGoal } from "@/types/goals";
import { useToast } from "@/hooks/use-toast";
import { useLocalDay } from "@/hooks/useLocalDay";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HabitWeekStrip } from "./components/HabitWeekStrip";
import { HabitMonthHeatmap } from "./components/HabitMonthHeatmap";

type HabitsView = "today" | "month";

const emptyHabit = (): HabitCreateRequest => ({
  name: "",
  description: "",
  frequency: "daily",
  target_per_week: 7,
  kind: "build",
  goal_id: null,
  goal_increment: null,
  color: null,
});

export default function Habits() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<
    Awaited<ReturnType<typeof fetchAllHabitLogs>>
  >([]);
  const [goals, setGoals] = useState<PersonalGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyHabit());
  const today = useLocalDay();
  const { toast } = useToast();
  const insights = useMemo(() => getHabitInsights(habits, logs), [habits, logs]);

  const todayParts = useMemo(() => {
    const [y, m] = today.split("-").map(Number);
    return { year: y ?? 2026, month: m ?? 1 };
  }, [today]);

  const [heatYear, setHeatYear] = useState(todayParts.year);
  const [heatMonth, setHeatMonth] = useState(todayParts.month);
  const [view, setView] = useState<HabitsView>("today");

  useEffect(() => {
    setHeatYear(todayParts.year);
    setHeatMonth(todayParts.month);
  }, [todayParts.year, todayParts.month]);

  const canGoNextMonth =
    heatYear < todayParts.year ||
    (heatYear === todayParts.year && heatMonth < todayParts.month);

  const overallHeatmap = useMemo(
    () => buildOverallMonthHeatmap(habits, logs, heatYear, heatMonth, today),
    [habits, logs, heatYear, heatMonth, today]
  );

  function goPrevMonth() {
    const next = shiftMonth(heatYear, heatMonth, -1);
    setHeatYear(next.year);
    setHeatMonth(next.month);
  }

  function goNextMonth() {
    if (!canGoNextMonth) return;
    const next = shiftMonth(heatYear, heatMonth, 1);
    setHeatYear(next.year);
    setHeatMonth(next.month);
  }

  const load = useCallback(async () => {
    try {
      const [h, l, g] = await Promise.all([
        fetchHabits(),
        fetchAllHabitLogs(),
        fetchGoals().catch(() => [] as PersonalGoal[]),
      ]);
      setHabits(h);
      setLogs(l);
      setGoals(g.filter((goal) => goal.status === "active"));
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load, today]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyHabit());
    setOpen(true);
  }

  function openEdit(habit: Habit) {
    setEditingId(habit.id);
    setForm({
      name: habit.name,
      description: habit.description ?? "",
      frequency: habit.frequency,
      target_per_week: habit.target_per_week,
      kind: habit.kind ?? (isAvoidHabit(habit) ? "avoid" : "build"),
      goal_id: habit.goal_id ?? null,
      goal_increment: habit.goal_increment ?? null,
      color: habit.color ?? null,
    });
    setOpen(true);
  }

  async function handleToggle(
    habitId: string,
    date = today,
    nextCompleted?: boolean
  ) {
    const done = logs.some(
      (l) => l.habit_id === habitId && l.date === date && l.completed
    );
    const next = nextCompleted ?? !done;
    if (next === done) return;

    const prev = logs;
    setLogs((current) => {
      const idx = current.findIndex(
        (l) => l.habit_id === habitId && l.date === date
      );
      if (idx >= 0) {
        const copy = [...current];
        copy[idx] = { ...copy[idx]!, completed: next };
        return copy;
      }
      return [
        ...current,
        {
          id: `optimistic-${habitId}-${date}`,
          habit_id: habitId,
          date,
          completed: next,
        },
      ];
    });

    try {
      await toggleHabitLog(habitId, date, next);
      const habit = habits.find((h) => h.id === habitId);
      if (habit?.goal_id) {
        const g = await fetchGoals().catch(() => null);
        if (g) setGoals(g.filter((goal) => goal.status === "active"));
      }
    } catch (error) {
      setLogs(prev);
      toast({
        title: "Erro",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    }
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    const payload: HabitCreateRequest = {
      ...form,
      target_per_week:
        form.frequency === "daily"
          ? 7
          : Math.max(1, Math.min(7, Number(form.target_per_week) || 1)),
      goal_id: form.goal_id || null,
      goal_increment:
        form.goal_id && form.goal_increment != null && Number(form.goal_increment) > 0
          ? Number(form.goal_increment)
          : null,
    };
    try {
      if (editingId) {
        await updateHabit({ id: editingId, ...payload });
        toast({ title: "Hábito atualizado", duration: 2000 });
      } else {
        await createHabit(payload);
        toast({ title: "Hábito criado", duration: 2000 });
      }
      setOpen(false);
      setEditingId(null);
      setForm(emptyHabit());
      await load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteHabit(id);
      toast({ title: "Hábito excluído", duration: 2000 });
      await load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    }
  }

  const doneCount = habits.filter((h) =>
    isCompletedToday(logs.filter((l) => l.habit_id === h.id), today)
  ).length;

  const activeGoals = goals;

  return (
    <PageShell
      title="Hábitos"
      description={
        habits.length === 0
          ? "Crie hábitos para acompanhar a rotina."
          : `Hoje: ${doneCount}/${habits.length}`
      }
      actions={
        <>
          <ModuleGuideButton moduleId="habits" />
          <Button onClick={openCreate}>Novo hábito</Button>
        </>
      }
    >
      <ModuleGuide moduleId="habits" />
      {loading ? (
        <TableLoadingSkeleton rows={6} />
      ) : habits.length === 0 ? (
        <EmptyState
          icon={Flame}
          title="Nenhum hábito"
          description="Crie hábitos (ou anti-hábitos como “Sem delivery”) para acompanhar a rotina."
          action={<Button onClick={openCreate}>Novo hábito</Button>}
        />
      ) : (
        <>
          <Tabs
            value={view}
            onValueChange={(v) => setView(v as HabitsView)}
            className="w-full sm:w-auto"
          >
            <TabsList className="grid w-full grid-cols-2 sm:w-auto">
              <TabsTrigger value="today">Hoje</TabsTrigger>
              <TabsTrigger value="month">Mês</TabsTrigger>
            </TabsList>
          </Tabs>

          {view === "today" ? (
            <>
              {insights.length > 0 ? (
                <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {insights.map((insight) => (
                    <div
                      key={insight.id}
                      className={cn(
                        "rounded-lg border px-3 py-2",
                        insight.tone === "success" &&
                          "border-success/30 bg-success/5",
                        insight.tone === "warning" &&
                          "border-warning/30 bg-warning/5",
                        insight.tone === "info" && "bg-muted/40"
                      )}
                    >
                      <p className="text-xs font-semibold">{insight.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {insight.detail}
                      </p>
                    </div>
                  ))}
                </section>
              ) : null}

              <div className="space-y-3">
                {habits.map((habit) => {
                  const habitLogs = logs.filter((l) => l.habit_id === habit.id);
                  const avoid = isAvoidHabit(habit);
                  const done = isCompletedToday(habitLogs, today);
                  const streak = calculateStreak(habitLogs);
                  const weekPct = getWeekProgress(habit, habitLogs);
                  const strip = getWeekStrip(habitLogs);
                  const linkedGoal = habit.goal_id
                    ? activeGoals.find((g) => g.id === habit.goal_id)
                    : null;

                  return (
                    <article
                      key={habit.id}
                      className={cn(
                        "rounded-xl border bg-card p-3 sm:p-4",
                        done &&
                          (avoid
                            ? "border-teal-500/30 bg-teal-500/5"
                            : "border-success/30 bg-success/5")
                      )}
                    >
                      <div className="flex items-start gap-3 sm:gap-4">
                        <button
                          type="button"
                          onClick={() => void handleToggle(habit.id, today)}
                          className={cn(
                            "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition-colors sm:h-10 sm:w-10",
                            done
                              ? avoid
                                ? "border-teal-600 bg-teal-600 text-white"
                                : "border-success bg-success text-success-foreground"
                              : "border-muted-foreground/30 hover:border-primary"
                          )}
                          aria-label={
                            avoid
                              ? done
                                ? "Desmarcar dia limpo"
                                : "Marcar dia limpo"
                              : done
                                ? "Desmarcar concluído"
                                : "Marcar concluído"
                          }
                        >
                          {done ? (
                            avoid ? (
                              <Ban className="h-4 w-4 sm:h-5 sm:w-5" />
                            ) : (
                              <Check className="h-4 w-4 sm:h-5 sm:w-5" />
                            )
                          ) : null}
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold">{habit.name}</h3>
                            {avoid ? (
                              <span className="rounded-full border border-teal-500/30 px-2 py-0.5 text-[10px] font-medium text-teal-700 dark:text-teal-300">
                                Anti-hábito
                              </span>
                            ) : null}
                          </div>
                          {habit.description ? (
                            <p className="truncate text-xs text-muted-foreground">
                              {habit.description}
                            </p>
                          ) : null}
                          <p className="text-xs text-muted-foreground">
                            {frequencyLabel(habit)}
                            {" · "}
                            {avoid ? "Dias limpos" : "Sequência"}: {streak}
                            {" · "}
                            Semana: {weekPct}%
                            {linkedGoal
                              ? ` · Meta: ${linkedGoal.title}`
                              : null}
                          </p>
                          <HabitWeekStrip
                            days={strip}
                            avoid={avoid}
                            onToggleDay={(date, next) => {
                              void handleToggle(habit.id, date, next);
                            }}
                          />
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className={cn("h-8 w-8", ICON_EDIT_BUTTON_CLASS)}
                            onClick={() => openEdit(habit)}
                          >
                            <Pen className="h-3.5 w-3.5" />
                          </Button>
                          <ConfirmDeleteDialog
                            title="Excluir este hábito?"
                            description="O histórico de registros também será removido."
                            onConfirm={() => handleDelete(habit.id)}
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
                    </article>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <section className="rounded-xl border bg-card p-3 sm:p-4">
                <HabitMonthHeatmap
                  map={overallHeatmap}
                  title="Visão geral"
                  onPrev={goPrevMonth}
                  onNext={goNextMonth}
                  canGoNext={canGoNextMonth}
                />
              </section>

              <div className="space-y-3">
                {habits.map((habit) => {
                  const habitLogs = logs.filter((l) => l.habit_id === habit.id);
                  const avoid = isAvoidHabit(habit);
                  const habitHeat = buildHabitMonthHeatmap(
                    habitLogs,
                    heatYear,
                    heatMonth,
                    {
                      today,
                      markMissed: habit.frequency === "daily",
                    }
                  );

                  return (
                    <article
                      key={habit.id}
                      className="rounded-xl border bg-card p-3 sm:p-4"
                    >
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold">{habit.name}</h3>
                            {avoid ? (
                              <span className="rounded-full border border-teal-500/30 px-2 py-0.5 text-[10px] font-medium text-teal-700 dark:text-teal-300">
                                Anti-hábito
                              </span>
                            ) : null}
                          </div>
                          <HabitMonthHeatmap
                            map={habitHeat}
                            avoid={avoid}
                            compact
                            showNav={false}
                          />
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className={cn("h-8 w-8", ICON_EDIT_BUTTON_CLASS)}
                            onClick={() => openEdit(habit)}
                          >
                            <Pen className="h-3.5 w-3.5" />
                          </Button>
                          <ConfirmDeleteDialog
                            title="Excluir este hábito?"
                            description="O histórico de registros também será removido."
                            onConfirm={() => handleDelete(habit.id)}
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
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setEditingId(null);
            setForm(emptyHabit());
          }
        }}
      >
        <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Editar hábito" : "Novo hábito"}
            </DialogTitle>
          </DialogHeader>
          <div className={FORM_FIELDS_CLASS}>
            <div>
              <FormLabel required>Nome</FormLabel>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex: Beber 2L · Sem delivery"
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
              <FormLabel required>Tipo</FormLabel>
              <Select
                value={form.kind ?? "build"}
                onValueChange={(v) =>
                  setForm({ ...form, kind: v as HabitKind })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="build">Construir rotina</SelectItem>
                  <SelectItem value="avoid">
                    Anti-hábito (dia limpo)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <FormLabel required>Frequência</FormLabel>
              <Select
                value={form.frequency}
                onValueChange={(v) => {
                  const frequency = v as "daily" | "weekly";
                  setForm({
                    ...form,
                    frequency,
                    target_per_week:
                      frequency === "daily" ? 7 : Math.min(form.target_per_week || 3, 7),
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Todo dia</SelectItem>
                  <SelectItem value="weekly">N vezes por semana</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.frequency === "weekly" ? (
              <div>
                <FormLabel required>Vezes por semana</FormLabel>
                <Input
                  type="number"
                  min={1}
                  max={7}
                  value={form.target_per_week || ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      target_per_week: Number(e.target.value) || 1,
                    })
                  }
                />
              </div>
            ) : null}
            <div>
              <FormLabel optional>Vincular a uma meta</FormLabel>
              <Select
                value={form.goal_id ?? "none"}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    goal_id: v === "none" ? null : v,
                    goal_increment:
                      v === "none" ? null : form.goal_increment ?? 1,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Nenhuma" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {activeGoals.map((goal) => (
                    <SelectItem key={goal.id} value={goal.id}>
                      {goal.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {activeGoals.length === 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Sem metas ativas.{" "}
                  <Link to="/goals" className="underline underline-offset-2">
                    Criar meta
                  </Link>
                </p>
              ) : null}
            </div>
            {form.goal_id ? (
              <div>
                <FormLabel required>Incremento na meta por check-in</FormLabel>
                <Input
                  type="number"
                  min={0.01}
                  step="any"
                  value={form.goal_increment ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      goal_increment: Number(e.target.value) || null,
                    })
                  }
                  placeholder="Ex: 1 (livro) ou 0,5 (km)"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Ao marcar o dia, soma esse valor ao progresso da meta.
                </p>
              </div>
            ) : null}
            <Button onClick={() => void handleSave()} className="w-full">
              {editingId ? "Salvar alterações" : "Criar hábito"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
