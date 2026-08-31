import { useEffect, useState } from "react";
import { Check, Loader2, Play, Square, Timer } from "lucide-react";
import { ActionTooltip } from "@/components/ActionTooltip";
import { Button } from "@/components/ui/button";
import { useActiveTimer } from "@/hooks/useActiveTimer";
import { useToast } from "@/hooks/use-toast";
import { fetchLastInteractedEntry, fetchTaskById, updateTask } from "@/api/tasks";
import { elapsedSeconds, formatDuration } from "@/domain/tasks";
import { getErrorMessage } from "@/lib/errors";
import type { Task, TaskTimeEntry } from "@/types/tasks";
import { cn } from "@/lib/utils";

/**
 * Widget flutuante de acesso rápido ao timer "Live" — fixo em todas as telas (montado uma vez em
 * `AdminLayout.tsx`, não só dentro do módulo Produtividade), já que o usuário pode cronometrar uma
 * tarefa enquanto navega por qualquer outro módulo. Mostra a tarefa com timer rodando; sem timer
 * ativo, mostra a última tarefa interagida como atalho pra retomar sem precisar abrir
 * `/tasks/live`. Responsivo: pill no canto inferior direito no desktop, barra acima da navegação
 * inferior no mobile — mesmo componente, sem duplicar a lógica de dados entre duas variações.
 *
 * Com timer rodando há também o atalho "parar e concluir" (feature 072): fecha o registro de tempo
 * e marca a tarefa como feita sem precisar caçá-la na Lista/Kanban/Agenda.
 */
export function LiveWidget() {
  const { runningEntry, start, stop } = useActiveTimer();
  const { toast } = useToast();
  const [lastEntry, setLastEntry] = useState<TaskTimeEntry | null>(null);
  const [task, setTask] = useState<Task | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [completing, setCompleting] = useState(false);

  useEffect(() => {
    if (runningEntry) return;
    let cancelled = false;
    fetchLastInteractedEntry()
      .then((entry) => {
        if (!cancelled) setLastEntry(entry);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [runningEntry]);

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

  /**
   * Para o timer e só então conclui a tarefa. A ordem importa: se a conclusão falhar sobra um timer
   * parado com a tarefa aberta (recuperável em qualquer tela); a ordem inversa deixaria a tarefa
   * concluída com o timer ainda rodando.
   */
  async function stopAndComplete() {
    if (!activeEntry || completing) return;
    const taskId = activeEntry.task_id;
    setCompleting(true);
    try {
      try {
        await stop();
      } catch (error) {
        toast({
          title: "Erro",
          description: getErrorMessage(error, "Não foi possível parar o timer."),
          variant: "destructive",
        });
        return;
      }
      try {
        await updateTask({ id: taskId, status: "done" });
      } catch (error) {
        // O "timer parado" vai no título porque `getErrorMessage` pode devolver a mensagem do erro
        // no lugar do fallback — sem isso o usuário clicaria de novo achando que nada aconteceu.
        toast({
          title: "Timer parado, mas não foi possível concluir a tarefa.",
          description: getErrorMessage(error, "Tente concluir pela lista de tarefas."),
          variant: "destructive",
        });
        return;
      }
      // No caminho feliz o próprio `stop()` zera `runningEntry` e o refetch traz a tarefa já
      // concluída — o pill some sozinho. Esta marcação local cobre o caminho torto: `refresh()`
      // do `ActiveTimerProvider` engole erros, então `runningEntry` pode continuar preenchido e o
      // `task` velho (status "todo") deixaria o check ali, convidando a um `updateTask` redundante.
      setTask((current) =>
        current && current.id === taskId ? { ...current, status: "done" } : current
      );
      toast({ title: "Tarefa concluída!", duration: 2000 });
    } finally {
      setCompleting(false);
    }
  }

  if (!activeEntry || !task) return null;
  // Timer parado + última tarefa interagida já concluída: não faz sentido oferecer "Retomar" nela.
  if (!isRunning && task.status === "done") return null;

  const seconds = isRunning
    ? elapsedSeconds(
        { taskId: activeEntry.task_id, startedAt: activeEntry.started_at, endedAt: null },
        now
      )
    : 0;

  // `completing` mantém o botão montado no intervalo entre o `stop()` (que já zera `runningEntry`)
  // e o fim do `updateTask`, para o spinner não sumir no meio da ação.
  const canComplete = (isRunning || completing) && task.status !== "done";

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
      {/* `shrink-0` + `flex-nowrap`: com três controles na barra mobile (`inset-x-3`), quem cede
          espaço é o título (que trunca), nunca os botões. */}
      <div className="flex shrink-0 flex-nowrap items-center gap-1.5">
        {isRunning && (
          <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
            {formatDuration(seconds)}
          </span>
        )}
        {canComplete && (
          <ActionTooltip label="Parar e concluir">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 shrink-0"
              onClick={stopAndComplete}
              disabled={completing}
              aria-label="Parar e marcar como concluída"
            >
              {completing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
            </Button>
          </ActionTooltip>
        )}
        <ActionTooltip label={isRunning ? "Parar timer" : "Retomar timer"}>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7 shrink-0"
            onClick={() => (isRunning ? stop() : start(activeEntry.task_id))}
            disabled={completing}
            aria-label={isRunning ? "Parar timer" : "Retomar timer"}
          >
            {isRunning ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </Button>
        </ActionTooltip>
      </div>
    </div>
  );
}
