import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Play, Square, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActiveTimer } from "@/hooks/useActiveTimer";
import { fetchLastInteractedEntry, fetchTaskById } from "@/api/tasks";
import { elapsedSeconds, formatDuration } from "@/domain/tasks";
import type { Task, TaskTimeEntry } from "@/types/tasks";
import { cn } from "@/lib/utils";

/**
 * Widget flutuante de acesso rápido ao timer "Live" — só aparece dentro do módulo
 * Produtividade (`/tasks*`). Mostra a tarefa com timer rodando; sem timer ativo, mostra a
 * última tarefa interagida como atalho pra retomar sem precisar abrir `/tasks/live`.
 * Responsivo: pill no canto inferior direito no desktop, barra acima da navegação inferior
 * no mobile — mesmo componente, sem duplicar a lógica de dados entre duas variações.
 */
export function LiveWidget() {
  const location = useLocation();
  const { runningEntry, start, stop } = useActiveTimer();
  const [lastEntry, setLastEntry] = useState<TaskTimeEntry | null>(null);
  const [task, setTask] = useState<Task | null>(null);
  const [now, setNow] = useState(() => new Date());

  const inProdutividade = location.pathname.startsWith("/tasks");

  useEffect(() => {
    if (!inProdutividade || runningEntry) return;
    let cancelled = false;
    fetchLastInteractedEntry()
      .then((entry) => {
        if (!cancelled) setLastEntry(entry);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [inProdutividade, runningEntry]);

  const activeEntry = runningEntry ?? lastEntry;
  const activeTaskId = activeEntry?.task_id ?? null;

  useEffect(() => {
    if (!activeTaskId) {
      setTask(null);
      return;
    }
    let cancelled = false;
    fetchTaskById(activeTaskId)
      .then((t) => {
        if (!cancelled) setTask(t);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [activeTaskId]);

  useEffect(() => {
    if (!runningEntry) return;
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, [runningEntry]);

  const isRunning = !!runningEntry;

  if (!inProdutividade || !activeEntry || !task) return null;
  // Timer parado + última tarefa interagida já concluída: não faz sentido oferecer "Retomar" nela.
  if (!isRunning && task.status === "done") return null;

  const seconds = isRunning
    ? elapsedSeconds(
        { taskId: activeEntry.task_id, startedAt: activeEntry.started_at, endedAt: null },
        now
      )
    : 0;

  return (
    <div
      className={cn(
        "fixed z-30 flex items-center gap-2 rounded-full border bg-card px-3 py-2 shadow-lg",
        "inset-x-3 bottom-[calc(3.25rem+env(safe-area-inset-bottom,0px))] justify-between",
        // md:bottom-24 fica acima do QuickAddExpenseFab (bottom-6, 56px), evitando sobrepor o "+"
        "md:inset-x-auto md:bottom-24 md:right-6 md:justify-start"
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Timer
          className={cn("h-4 w-4 shrink-0", isRunning ? "text-primary" : "text-muted-foreground")}
        />
        <span className="truncate text-sm">{task.title}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {isRunning && (
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {formatDuration(seconds)}
          </span>
        )}
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={() => (isRunning ? stop() : start(activeEntry.task_id))}
          aria-label={isRunning ? "Parar timer" : "Retomar timer"}
        >
          {isRunning ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );
}
