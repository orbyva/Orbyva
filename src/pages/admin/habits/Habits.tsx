import { useCallback, useEffect, useMemo, useState } from "react";
import { Flame, Trash2, Check, Pen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/EmptyState";
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
import {
  calculateStreak,
  getTodayIso,
  getWeekProgress,
  isCompletedToday,
} from "@/domain/habits";
import { getHabitInsights } from "@/domain/habits/insights";
import type { Habit, HabitCreateRequest } from "@/types/habits";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

const emptyHabit = (): HabitCreateRequest => ({
  name: "",
  description: "",
  frequency: "daily",
  target_per_week: 7,
  color: null,
});

export default function Habits() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<
    Awaited<ReturnType<typeof fetchAllHabitLogs>>
  >([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyHabit());
  const today = getTodayIso();
  const { toast } = useToast();
  const insights = useMemo(() => getHabitInsights(habits, logs), [habits, logs]);

  const load = useCallback(async () => {
    try {
      const [h, l] = await Promise.all([fetchHabits(), fetchAllHabitLogs()]);
      setHabits(h);
      setLogs(l);
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
  }, [load]);

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
      color: habit.color ?? null,
    });
    setOpen(true);
  }

  async function handleToggle(habitId: string) {
    const habitLogs = logs.filter((l) => l.habit_id === habitId);
    const done = isCompletedToday(habitLogs);
    try {
      await toggleHabitLog(habitId, today, !done);
      await load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    }
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    try {
      if (editingId) {
        await updateHabit({ id: editingId, ...form });
        toast({ title: "Hábito atualizado", duration: 2000 });
      } else {
        await createHabit(form);
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
    isCompletedToday(logs.filter((l) => l.habit_id === h.id))
  ).length;

  return (
    <PageShell
      title="Hábitos"
      description={`Hoje: ${doneCount}/${habits.length} concluídos`}
      actions={<Button onClick={openCreate}>Novo hábito</Button>}
    >
      {loading ? (
        <TableLoadingSkeleton rows={6} />
      ) : habits.length === 0 ? (
        <EmptyState
          icon={Flame}
          title="Nenhum hábito"
          description="Crie hábitos para acompanhar sua rotina diária."
          action={<Button onClick={openCreate}>Novo hábito</Button>}
        />
      ) : (
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
              const done = isCompletedToday(habitLogs);
              const streak = calculateStreak(habitLogs);
              const weekPct = getWeekProgress(habit, habitLogs);

              return (
                <article
                  key={habit.id}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border bg-card p-3 sm:gap-4 sm:p-4",
                    done && "border-success/30 bg-success/5"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => void handleToggle(habit.id)}
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition-colors sm:h-10 sm:w-10",
                      done
                        ? "border-success bg-success text-success-foreground"
                        : "border-muted-foreground/30 hover:border-primary"
                    )}
                  >
                    {done ? <Check className="h-4 w-4 sm:h-5 sm:w-5" /> : null}
                  </button>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold">{habit.name}</h3>
                    {habit.description ? (
                      <p className="truncate text-xs text-muted-foreground">
                        {habit.description}
                      </p>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                      Sequência: {streak} dias · Semana: {weekPct}%
                    </p>
                    <div className="mt-1.5 h-1 w-full max-w-[120px] overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${weekPct}%` }}
                      />
                    </div>
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
                </article>
              );
            })}
          </div>
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
                placeholder="Ex: Beber 2L de água"
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
            <Button onClick={() => void handleSave()} className="w-full">
              {editingId ? "Salvar alterações" : "Criar hábito"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
