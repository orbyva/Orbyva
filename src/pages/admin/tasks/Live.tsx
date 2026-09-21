import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
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
import { TimeEntryRow } from "./TimeEntryRow";
import { deleteTimeEntry, fetchAllEntries, fetchProjects, fetchTasks, updateTimeEntry } from "@/api/tasks";
import { elapsedSeconds, formatDuration, groupEntriesByDay } from "@/domain/tasks";
import { formatDateBR } from "@/lib/currency";
import { formatLocalIsoDate } from "@/lib/dates";
import type { Project, Task, TaskTimeEntry } from "@/types/tasks";
import { useToast } from "@/hooks/use-toast";
import { useActiveTimer } from "@/hooks/useActiveTimer";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

type DateScope = "today" | "all";

export default function Live() {
  const [searchParams] = useSearchParams();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [entries, setEntries] = useState<TaskTimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTaskId, setSelectedTaskId] = useState<string>("");
  const [now, setNow] = useState(() => new Date());
  const [dateScope, setDateScope] = useState<DateScope>(() =>
    searchParams.get("project") ? "all" : "today"
  );
  const [projectFilter, setProjectFilter] = useState<string>(
    () => searchParams.get("project") ?? "all"
  );
  const [taskFilter, setTaskFilter] = useState<string>("all");
  const { toast } = useToast();
  const { runningEntry: running, start, stop } = useActiveTimer();

  /**
   * Filtros vindos da URL (feature 100): é assim que a Orb abre a tela já filtrada, e é o que faz
   * um link com `?project=` funcionar. Roda a cada troca de query string — a tela não remonta quando só
   * os parâmetros mudam, então ler no `useState` inicial pegaria apenas a primeira.
   */
  useEffect(() => {
    const projeto = searchParams.get("project");
    if (!projeto) return;
    setProjectFilter(projeto);
    // Chegar por um link de projeto é pedir a lista dele inteira, não só o que cai hoje.
    setDateScope("all");
  }, [searchParams]);

  const load = useCallback(async () => {
    try {
      const [taskList, projectList, entryList] = await Promise.all([
        fetchTasks(),
        fetchProjects(),
        fetchAllEntries(),
      ]);
      setTasks(taskList);
      setProjects(projectList);
      setEntries(entryList);
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
    () =>
      tasks.filter(
        (t) =>
          t.status !== "done" &&
          !(t.linked_recurring_id && t.linked_installment_number == null)
      ),
    [tasks]
  );

  const runningTask = running ? tasksById.get(running.task_id) : null;
  const runningSeconds = running
    ? elapsedSeconds(
        { taskId: running.task_id, startedAt: running.started_at, endedAt: null },
        now
      )
    : 0;

  const todayIso = useMemo(() => formatLocalIsoDate(now), [now]);

  const filteredEntries = useMemo(
    () =>
      entries.filter((e) => {
        if (dateScope === "today" && formatLocalIsoDate(new Date(e.started_at)) !== todayIso) {
          return false;
        }
        if (taskFilter !== "all" && e.task_id !== taskFilter) return false;
        if (projectFilter !== "all" && tasksById.get(e.task_id)?.project_id !== projectFilter) {
          return false;
        }
        return true;
      }),
    [entries, dateScope, todayIso, taskFilter, projectFilter, tasksById]
  );

  const dayGroups = useMemo(
    () =>
      groupEntriesByDay(
        filteredEntries.map((e) => ({
          id: e.id,
          taskId: e.task_id,
          startedAt: e.started_at,
          endedAt: e.ended_at,
          raw: e,
        }))
      ),
    [filteredEntries]
  );

  async function handleStart() {
    if (!selectedTaskId) return;
    try {
      await start(selectedTaskId);
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
      await stop();
      load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível parar o timer."),
        variant: "destructive",
      });
    }
  }

  async function handleSaveEntry(
    entry: TaskTimeEntry,
    payload: { started_at: string; ended_at: string | null }
  ) {
    try {
      await updateTimeEntry(entry.id, payload);
      load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível salvar o registro."),
        variant: "destructive",
      });
    }
  }

  async function handleDeleteEntry(entry: TaskTimeEntry) {
    try {
      await deleteTimeEntry(entry.id);
      load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível excluir o registro."),
        variant: "destructive",
      });
    }
  }

  return (
    <PageShell
      title="Live"
      description="Timer de foco por tarefa e histórico completo dos registros."
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
                  {formatDuration(runningSeconds)}
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

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Histórico</h3>
              <div className="flex items-center gap-1 rounded-lg border p-0.5">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className={cn("h-7 px-2.5 text-xs", dateScope === "today" && "bg-muted")}
                  onClick={() => setDateScope("today")}
                >
                  Hoje
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className={cn("h-7 px-2.5 text-xs", dateScope === "all" && "bg-muted")}
                  onClick={() => setDateScope("all")}
                >
                  Tudo
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Select value={projectFilter} onValueChange={setProjectFilter}>
                <SelectTrigger className="h-8 w-44">
                  <SelectValue placeholder="Projeto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os projetos</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={taskFilter} onValueChange={setTaskFilter}>
                <SelectTrigger className="h-8 w-44">
                  <SelectValue placeholder="Tarefa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as tarefas</SelectItem>
                  {tasks.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {dayGroups.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                Nenhum tempo registrado {dateScope === "today" ? "hoje" : "ainda"}.
              </p>
            ) : (
              <div className="space-y-4">
                {dayGroups.map((group) => (
                  <div key={group.dayIso} className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">
                      {formatDateBR(group.dayIso)}
                    </p>
                    {group.entries.map((entry) => (
                      <TimeEntryRow
                        key={entry.id}
                        entry={entry.raw}
                        taskTitle={tasksById.get(entry.taskId)?.title ?? "Tarefa removida"}
                        now={now}
                        onSave={(payload) => handleSaveEntry(entry.raw, payload)}
                        onDelete={() => handleDeleteEntry(entry.raw)}
                      />
                    ))}
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
