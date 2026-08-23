import { useCallback, useRef, useState } from "react";
import { updateTask } from "@/api/tasks";
import { computeImmediateSchedule } from "@/domain/tasks";
import { useActiveTimer } from "@/hooks/useActiveTimer";
import { useToast } from "@/hooks/use-toast";
import { formatDateBR, formatDateTimeBR } from "@/lib/currency";
import { formatLocalIsoDate } from "@/lib/dates";
import { getErrorMessage } from "@/lib/errors";
import type { Task } from "@/types/tasks";

export interface UseStartTaskNowOptions {
  /** Resolve o título de uma tarefa pelo id — usado só pra dizer no toast **qual** timer foi
   * parado quando a ação interrompeu outra tarefa (hoje isso acontece em silêncio). Sem o
   * resolvedor (ou sem match), o toast fala genericamente do "timer anterior". */
  resolveTaskTitle?: (taskId: string) => string | undefined;
  /** Chamado depois que timer + prazo foram aplicados com sucesso — as telas passam `load()`,
   * pra tarefa reagrupar no bucket "Hoje" na hora (a mesma regra que a feature 081 leva pro
   * quick-edit de prazo). */
  onApplied?: () => void | Promise<void>;
}

export interface UseStartTaskNowResult {
  /** Um clique = três efeitos: para o timer anterior (se houver), inicia o desta tarefa e grava
   * `due_date`/`due_time` = agora + duração estimada. */
  startNow: (task: Task) => Promise<void>;
  /** Alguma tarefa está sendo iniciada agora — usado pra desabilitar o botão e evitar clique
   * duplo (que abriria dois registros de tempo). */
  pending: boolean;
  /** Qual tarefa está em voo, pra desabilitar só o botão dela. */
  pendingTaskId: string | null;
}

/**
 * Hook do botão "Imediatamente" (feature 078), compartilhado por `TaskList.tsx` e
 * `ProjectDetail.tsx` — em vez de uma terceira e quarta cópia do handler `toggleTimer`, que já
 * está duplicado byte a byte entre as duas telas.
 *
 * Ordem e falhas, deliberadas:
 * 1. `start(task.id)` — `startTimer` já para sozinho qualquer timer anterior. Se **isso** falhar,
 *    nada mais acontece: sem trabalho começado, não faz sentido mexer no prazo.
 * 2. `updateTask({ due_date, due_time })`. Se falhar **depois** do timer ter começado, o timer
 *    **não** é revertido — o trabalho de fato começou, e apagar um registro de tempo real seria
 *    pior que um prazo não salvo. O toast diz exatamente isso.
 */
export function useStartTaskNow({
  resolveTaskTitle,
  onApplied,
}: UseStartTaskNowOptions = {}): UseStartTaskNowResult {
  const { runningEntry, start } = useActiveTimer();
  const { toast } = useToast();
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);
  /** Guarda síncrona: `setPendingTaskId` só reflete no próximo render, então dois cliques no mesmo
   * tick passariam pela checagem de estado e abririam dois registros de tempo. */
  const inFlightRef = useRef(false);

  const startNow = useCallback(
    async (task: Task) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      setPendingTaskId(task.id);

      const stoppedTaskId =
        runningEntry && runningEntry.task_id !== task.id ? runningEntry.task_id : null;
      const previousDue = task.due_date
        ? formatDateTimeBR(task.due_date, task.due_time)
        : null;

      try {
        try {
          await start(task.id);
        } catch (error) {
          toast({
            title: "Erro",
            description: getErrorMessage(error, "Não foi possível iniciar o timer."),
            variant: "destructive",
          });
          return;
        }

        const schedule = computeImmediateSchedule(task);
        try {
          await updateTask({
            id: task.id,
            due_date: schedule.due_date,
            due_time: schedule.due_time,
          });
        } catch (error) {
          toast({
            title: "Timer iniciado, mas o prazo não foi salvo",
            description: getErrorMessage(
              error,
              "O timer está rodando; só o prazo não foi gravado. Tente de novo."
            ),
            variant: "destructive",
          });
          return;
        }

        const isToday = schedule.due_date === formatLocalIsoDate(new Date());
        const dueLabel = isToday
          ? schedule.due_time
          : `${formatDateBR(schedule.due_date)} ${schedule.due_time}`;

        const details: string[] = [];
        if (schedule.usedFallbackMinutes) {
          details.push(
            `Sem duração estimada — usamos ${schedule.usedFallbackMinutes} min.`
          );
        }
        if (stoppedTaskId) {
          const stoppedTitle = resolveTaskTitle?.(stoppedTaskId);
          details.push(
            stoppedTitle
              ? `O timer de "${stoppedTitle}" foi parado.`
              : "O timer anterior foi parado."
          );
        }
        if (previousDue) {
          details.push(`Prazo anterior: ${previousDue}.`);
        }

        toast({
          title: `Começou agora · prazo ${dueLabel}`,
          description: details.length > 0 ? details.join(" ") : undefined,
        });

        await onApplied?.();
      } finally {
        inFlightRef.current = false;
        setPendingTaskId(null);
      }
    },
    [runningEntry, start, toast, resolveTaskTitle, onApplied]
  );

  return { startNow, pending: pendingTaskId !== null, pendingTaskId };
}
