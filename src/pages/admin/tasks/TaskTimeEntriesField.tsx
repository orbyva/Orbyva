import { useEffect, useState } from "react";
import { fetchEntriesForTask } from "@/api/tasks";
import { elapsedSeconds, formatDuration } from "@/domain/tasks";
import { formatDateBR } from "@/lib/currency";
import { formatLocalIsoDate } from "@/lib/dates";
import type { TaskTimeEntry } from "@/types/tasks";

/**
 * Seção somente-leitura com os registros de tempo (`task_time_entry`) de uma tarefa — usada no
 * dialog de edição pra mostrar quanto tempo já foi cronometrado nela, sem precisar ir até
 * `/tasks/live` pra ver o histórico.
 */
export function TaskTimeEntriesField({ taskId }: { taskId: string }) {
  const [entries, setEntries] = useState<TaskTimeEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    fetchEntriesForTask(taskId)
      .then((data) => {
        if (!cancelled) setEntries(data);
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      });
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  if (entries === null) return null;

  return (
    <div>
      <p className="text-sm font-medium">Registros de tempo</p>
      {entries.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">Nenhum registro ainda.</p>
      ) : (
        <div className="mt-1.5 max-h-40 space-y-1 overflow-y-auto">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between rounded-md border px-2.5 py-1.5 text-xs"
            >
              <span className="text-muted-foreground">
                {formatDateBR(formatLocalIsoDate(new Date(entry.started_at)))}
              </span>
              <span className="font-medium tabular-nums">
                {entry.ended_at
                  ? formatDuration(
                      elapsedSeconds({
                        taskId: entry.task_id,
                        startedAt: entry.started_at,
                        endedAt: entry.ended_at,
                      })
                    )
                  : "em andamento"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
