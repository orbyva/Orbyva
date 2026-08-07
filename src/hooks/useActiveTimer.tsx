import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { fetchRunningEntry, startTimer, stopTimer } from "@/api/tasks";
import type { TaskTimeEntry } from "@/types/tasks";
import { useAuth } from "@/hooks/useAuth";

type ActiveTimerContextValue = {
  runningEntry: TaskTimeEntry | null;
  /** Inicia o timer da tarefa — `startTimer` já para qualquer timer anterior sozinho. */
  start: (taskId: string) => Promise<void>;
  stop: () => Promise<void>;
  refresh: () => Promise<void>;
};

const ActiveTimerContext = createContext<ActiveTimerContextValue>({
  runningEntry: null,
  start: async () => {},
  stop: async () => {},
  refresh: async () => {},
});

/**
 * Estado compartilhado do timer "Live" — montado uma vez em `AdminLayout`, consumido tanto por
 * `Live.tsx` quanto pelas ações de iniciar timer direto nos cards de tarefa (Lista/Agenda/Kanban),
 * pra que todos os lugares saibam qual tarefa está com o timer rodando.
 */
export function ActiveTimerProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [runningEntry, setRunningEntry] = useState<TaskTimeEntry | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setRunningEntry(null);
      return;
    }
    try {
      const entry = await fetchRunningEntry();
      setRunningEntry(entry);
    } catch {
      // indicador auxiliar — uma falha aqui não deve quebrar o resto da página
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const start = useCallback(
    async (taskId: string) => {
      await startTimer(taskId);
      await refresh();
    },
    [refresh]
  );

  const stop = useCallback(async () => {
    if (!runningEntry) return;
    await stopTimer(runningEntry.id);
    await refresh();
  }, [runningEntry, refresh]);

  const value = useMemo(
    () => ({ runningEntry, start, stop, refresh }),
    [runningEntry, start, stop, refresh]
  );

  return (
    <ActiveTimerContext.Provider value={value}>{children}</ActiveTimerContext.Provider>
  );
}

export function useActiveTimer() {
  return useContext(ActiveTimerContext);
}
