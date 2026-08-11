import { useCallback, useEffect, useState } from "react";
import { deleteTimeEntry, fetchEntriesForTask, updateTimeEntry } from "@/api/tasks";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { TimeEntryRow } from "./TimeEntryRow";
import type { TaskTimeEntry } from "@/types/tasks";

/**
 * Seção com os registros de tempo (`task_time_entry`) de uma tarefa — usada no dialog de edição
 * pra ver e editar (início/fim, excluir) quanto tempo já foi cronometrado nela, sem precisar ir
 * até `/tasks/live`.
 */
export function TaskTimeEntriesField({ taskId }: { taskId: string }) {
  const [entries, setEntries] = useState<TaskTimeEntry[] | null>(null);
  const [now, setNow] = useState(() => new Date());
  const { toast } = useToast();

  const load = useCallback(() => {
    return fetchEntriesForTask(taskId)
      .then((data) => setEntries(data))
      .catch(() => setEntries([]));
  }, [taskId]);

  useEffect(() => {
    setEntries(null);
    load();
  }, [load]);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  async function handleSave(
    entry: TaskTimeEntry,
    payload: { started_at: string; ended_at: string | null }
  ) {
    try {
      await updateTimeEntry(entry.id, payload);
      await load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível salvar o registro."),
        variant: "destructive",
      });
    }
  }

  async function handleDelete(entry: TaskTimeEntry) {
    try {
      await deleteTimeEntry(entry.id);
      await load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível excluir o registro."),
        variant: "destructive",
      });
    }
  }

  if (entries === null) return null;

  return (
    <div>
      <p className="text-sm font-medium">Registros de tempo</p>
      {entries.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">Nenhum registro ainda.</p>
      ) : (
        <div className="mt-1.5 max-h-64 space-y-1.5 overflow-y-auto">
          {entries.map((entry) => (
            <TimeEntryRow
              key={entry.id}
              entry={entry}
              now={now}
              onSave={(payload) => handleSave(entry, payload)}
              onDelete={() => handleDelete(entry)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
