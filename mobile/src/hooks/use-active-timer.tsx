import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  fetchRunningEntry,
  startTimer,
  stopTimer,
} from "@/api/tasks/timeEntries";
import { useAuth } from "@/hooks/use-auth";
import type { TaskTimeEntry } from "@/types/tasks";

type ActiveTimerContextValue = {
  runningEntry: TaskTimeEntry | null;
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

export function ActiveTimerProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [runningEntry, setRunningEntry] = useState<TaskTimeEntry | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setRunningEntry(null);
      return;
    }
    try {
      setRunningEntry(await fetchRunningEntry());
    } catch {
      // indicador auxiliar — falha aqui não quebra o resto do app
    }
  }, [user]);

  useEffect(() => {
    void refresh();
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
  }, [refresh, runningEntry]);

  const value = useMemo(
    () => ({ runningEntry, start, stop, refresh }),
    [refresh, runningEntry, start, stop]
  );

  return (
    <ActiveTimerContext.Provider value={value}>
      {children}
    </ActiveTimerContext.Provider>
  );
}

export function useActiveTimer() {
  return useContext(ActiveTimerContext);
}
