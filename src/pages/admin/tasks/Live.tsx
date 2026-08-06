import { useCallback, useEffect, useMemo, useState } from "react";
import { Play, Square, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/EmptyState";
import { PageShell } from "@/components/PageShell";
import { TableLoadingSkeleton } from "@/components/TableLoadingSkeleton";
import {
  fetchRunningEntry,
  fetchTasks,
  fetchTodayEntries,
  startTimer,
  stopTimer,
} from "@/api/tasks";
import { elapsedSeconds, formatDuration, totalSecondsForTask } from "@/domain/tasks";
import type { Task, TaskTimeEntry } from "@/types/tasks";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";

function formatClock(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

export default function Live() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [running, setRunning] = useState<TaskTimeEntry | null>(null);
  const [todayEntries, setTodayEntries] = useState<TaskTimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTaskId, setSelectedTaskId] = useState<string>("");
  const [now, setNow] = useState(() => new Date());
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      const [taskList, runningEntry, entries] = await Promise.all([
        fetchTasks(),
        fetchRunningEntry(),
        fetchTodayEntries(),
      ]);
      setTasks(taskList);
      setRunning(runningEntry);
      setTodayEntries(entries);
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível carregar a seção Live."),
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
    if (!running) return;
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, [running]);

  const tasksById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const availableTasks = useMemo(
    () => tasks.filter((t) => t.status !== "done"),
    [tasks]
  );

  const runningTask = running ? tasksById.get(running.task_id) : null;
  const runningSeconds = running
    ? elapsedSeconds(
        { taskId: running.task_id, startedAt: running.started_at, endedAt: null },
        now
      )
    : 0;

  const todaySummary = useMemo(() => {
    const timeEntries = todayEntries.map((e) => ({
      taskId: e.task_id,
      startedAt: e.started_at,
      endedAt: e.ended_at,
    }));
    const taskIds = Array.from(new Set(timeEntries.map((e) => e.taskId)));
    return taskIds
      .map((taskId) => ({
        taskId,
        title: tasksById.get(taskId)?.title ?? "Tarefa removida",
        totalSeconds: totalSecondsForTask(taskId, timeEntries, now),
      }))
      .sort((a, b) => b.totalSeconds - a.totalSeconds);
  }, [todayEntries, tasksById, now]);

  async function handleStart() {
    if (!selectedTaskId) return;
    try {
      await startTimer(selectedTaskId);
      setSelectedTaskId("");
      load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível iniciar o timer."),
        variant: "destructive",
      });
    }
  }

  async function handleStop() {
    if (!running) return;
    try {
      await stopTimer(running.id);
      load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível parar o timer."),
        variant: "destructive",
      });
    }
  }

  return (
    <PageShell
      title="Live"
      description="Timer de foco por tarefa e histórico do dia."
      eyebrow="Produtividade"
    >
      {loading ? (
        <TableLoadingSkeleton rows={3} />
      ) : (
        <>
          <div className="rounded-xl border bg-card p-4 sm:p-6">
            {running ? (
              <div className="flex flex-col items-center gap-3 text-center">
                <Badge variant="outline" className="text-xs">
                  {runningTask?.title ?? "Tarefa removida"}
                </Badge>
                <p className="font-mono text-4xl font-bold tabular-nums sm:text-5xl">
                  {formatClock(runningSeconds)}
                </p>
                <Button onClick={handleStop} variant="destructive" className="gap-2">
                  <Square className="h-4 w-4" />
                  Parar
                </Button>
              </div>
            ) : availableTasks.length === 0 ? (
              <EmptyState
                icon={Timer}
                title="Nenhuma tarefa disponível"
                description="Crie uma tarefa para poder cronometrar seu tempo."
              />
            ) : (
              <div className="flex flex-col items-center gap-3">
                <p className="text-sm text-muted-foreground">
                  Escolha uma tarefa para começar a cronometrar
                </p>
                <div className="flex w-full max-w-sm flex-col gap-2 sm:flex-row">
                  <Select value={selectedTaskId} onValueChange={setSelectedTaskId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma tarefa" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableTasks.map((task) => (
                        <SelectItem key={task.id} value={task.id}>
                          {task.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={handleStart}
                    disabled={!selectedTaskId}
                    className="gap-2 sm:shrink-0"
                  >
                    <Play className="h-4 w-4" />
                    Iniciar
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Hoje</h3>
            {todaySummary.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                Nenhum tempo registrado hoje ainda.
              </p>
            ) : (
              <div className="space-y-1.5">
                {todaySummary.map((entry) => (
                  <div
                    key={entry.taskId}
                    className="flex items-center justify-between rounded-lg border bg-card px-3 py-2"
                  >
                    <span className="truncate text-sm">{entry.title}</span>
                    <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                      {formatDuration(entry.totalSeconds)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </PageShell>
  );
}
