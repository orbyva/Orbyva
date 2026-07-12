import { useCallback, useEffect, useState } from "react";
import { Flame, Trash2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/EmptyState";
import { FormLabel, FORM_DIALOG_CONTENT_CLASS, FORM_FIELDS_CLASS, PAGE_HEADER_ACTIONS_CLASS } from "@/components/FormLabel";
import { createHabit, deleteHabit, fetchAllHabitLogs, fetchHabits, toggleHabitLog } from "@/api/habits";
import { calculateStreak, getTodayIso, getWeekProgress, isCompletedToday } from "@/domain/habits";
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
  const [logs, setLogs] = useState<Awaited<ReturnType<typeof fetchAllHabitLogs>>>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyHabit());
  const today = getTodayIso();
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      const [h, l] = await Promise.all([fetchHabits(), fetchAllHabitLogs()]);
      setHabits(h);
      setLogs(l);
    } catch (error) {
      toast({ title: "Erro", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  async function handleToggle(habitId: string) {
    const habitLogs = logs.filter((l) => l.habit_id === habitId);
    const done = isCompletedToday(habitLogs);
    try {
      await toggleHabitLog(habitId, today, !done);
      load();
    } catch (error) {
      toast({ title: "Erro", description: getErrorMessage(error), variant: "destructive" });
    }
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    try {
      await createHabit(form);
      toast({ title: "Hábito criado!", duration: 2000 });
      setOpen(false);
      setForm(emptyHabit());
      load();
    } catch (error) {
      toast({ title: "Erro", description: getErrorMessage(error), variant: "destructive" });
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteHabit(id);
      toast({ title: "Hábito excluído", duration: 2000 });
      load();
    } catch (error) {
      toast({ title: "Erro", description: getErrorMessage(error), variant: "destructive" });
    }
  }

  const doneCount = habits.filter((h) =>
    isCompletedToday(logs.filter((l) => l.habit_id === h.id))
  ).length;

  return (
    <main className="w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Hábitos</h1>
          <p className="text-sm text-muted-foreground">
            Hoje: {doneCount}/{habits.length} concluídos
          </p>
        </div>
        <div className={PAGE_HEADER_ACTIONS_CLASS}>
          <Button onClick={() => setOpen(true)}>Novo hábito</Button>
        </div>
      </section>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : habits.length === 0 ? (
        <EmptyState icon={Flame} title="Nenhum hábito" description="Crie hábitos para acompanhar sua rotina diária." />
      ) : (
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
                  "flex items-center gap-4 rounded-xl border bg-card p-4",
                  done && "border-success/30 bg-success/5"
                )}
              >
                <button
                  type="button"
                  onClick={() => handleToggle(habit.id)}
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                    done ? "border-success bg-success text-success-foreground" : "border-muted-foreground/30 hover:border-primary"
                  )}
                >
                  {done && <Check className="h-5 w-5" />}
                </button>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold">{habit.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    🔥 {streak} dias · Semana: {weekPct}%
                  </p>
                  <div className="mt-1.5 h-1 w-full max-w-[120px] rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${weekPct}%` }} />
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="text-destructive h-8 w-8" onClick={() => handleDelete(habit.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </article>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
          <DialogHeader><DialogTitle>Novo hábito</DialogTitle></DialogHeader>
          <div className={FORM_FIELDS_CLASS}>
            <div>
              <FormLabel required>Nome</FormLabel>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Beber 2L de água" />
            </div>
            <div>
              <FormLabel optional>Descrição</FormLabel>
              <Input value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <Button onClick={handleSave} className="w-full">Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
