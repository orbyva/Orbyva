import { formatDateTimeBR } from "@/lib/currency";
import { isDoseLate } from "@/domain/tasks/medication";
import { TASK_STATUS_LABELS, type Task } from "@/types/tasks";

export interface OccurrenceRow {
  id: string;
  label: string;
  statusLabel: string;
  late: boolean;
}

function timeOfDay(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * Linhas da tela "Ocorrências" (espelho do `SeriesOccurrencesDialog` do web): séries de medicação
 * e consulta trocam, na ocorrência concluída, o prazo pelo instante real ("Tomado às" /
 * "Compareceu às"); "atrasada" só vale para dose.
 */
export function describeOccurrences(seriesTask: Task, occurrences: Task[]): OccurrenceRow[] {
  const isMedication = !!seriesTask.is_medication;
  const isConsultation = !!seriesTask.is_consultation;
  const tracksAttendance = isMedication || isConsultation;
  return occurrences.map((task) => {
    const registered = tracksAttendance && task.status === "done" && task.completed_at;
    return {
      id: task.id,
      label: registered
        ? `${isConsultation ? "Compareceu às" : "Tomado às"} ${timeOfDay(task.completed_at as string)} · ${formatDateTimeBR(task.due_date as string, null)}`
        : task.due_date
          ? formatDateTimeBR(task.due_date, task.due_time)
          : "Sem prazo",
      statusLabel: TASK_STATUS_LABELS[task.status],
      late: isMedication && isDoseLate(task),
    };
  });
}

export function emptyAttendanceMessage(seriesTask: Task, occurrences: Task[]): string | null {
  if (!seriesTask.is_medication && !seriesTask.is_consultation) return null;
  if (occurrences.some((task) => task.status === "done")) return null;
  return seriesTask.is_consultation
    ? "Nenhuma consulta registrada ainda."
    : "Nenhuma dose registrada ainda.";
}
