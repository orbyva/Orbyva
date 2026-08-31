import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { isDoseLate } from "@/domain/tasks";
import { formatDateTimeBR } from "@/lib/currency";
import { formatTimeOfDay } from "./TimeEntryRow";
import type { Task } from "@/types/tasks";

const STATUS_LABEL: Record<Task["status"], string> = {
  todo: "A fazer",
  doing: "Fazendo",
  done: "Feito",
};

interface SeriesOccurrencesDialogProps {
  /** Tarefa-origem da série aberta, ou `null` quando o dialog está fechado. */
  seriesTask: Task | null;
  /** Ocorrências da série (`findSeriesTasks`), já na ordem de exibição. */
  seriesTasks: Task[];
  onClose: () => void;
}

/**
 * Dialog "Ocorrências de..." — mostra a linha do tempo de uma série recorrente. Era duplicado byte
 * a byte entre `TaskList.tsx` e `ProjectDetail.tsx`; virou componente ao ganhar o segundo tipo de
 * série (consulta médica, feature 061, além da medicação da 049), que dobraria a duplicação.
 *
 * Séries com registro de "aconteceu" (medicação e consulta) trocam, na ocorrência concluída, o
 * horário agendado pelo instante real em que ela foi marcada como feita (`completed_at`) — para
 * medicação isso é "Tomado às", para consulta é "Compareceu às". Série comum não muda em nada:
 * continua mostrando só o prazo agendado.
 */
export function SeriesOccurrencesDialog({
  seriesTask,
  seriesTasks,
  onClose,
}: SeriesOccurrencesDialogProps) {
  const isMedication = !!seriesTask?.is_medication;
  const isConsultation = !!seriesTask?.is_consultation;
  const tracksAttendance = isMedication || isConsultation;
  const hasAnyDone = seriesTasks.some((t) => t.status === "done");

  return (
    <Dialog open={!!seriesTask} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ocorrências de "{seriesTask?.title}"</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          {tracksAttendance && !hasAnyDone && (
            <p className="text-xs text-muted-foreground">
              {isConsultation
                ? "Nenhuma consulta registrada ainda."
                : "Nenhuma dose registrada ainda."}
            </p>
          )}
          {seriesTasks.map((t) => {
            const registered = tracksAttendance && t.status === "done" && t.completed_at;
            return (
              <div
                key={t.id}
                className="flex items-center justify-between gap-3 rounded-lg border bg-card p-2.5 text-sm"
              >
                {registered ? (
                  <span className="flex items-center gap-2">
                    {isConsultation ? "Compareceu às" : "Tomado às"}{" "}
                    {formatTimeOfDay(t.completed_at as string)}
                    {/* "Atrasada" só faz sentido para dose: o horário da medicação é o que ela
                        precisa cumprir. Chegar depois do horário marcado numa consulta não é um
                        estado que o app saiba julgar (a espera é do consultório), então não há
                        badge para consulta. */}
                    {isMedication && isDoseLate(t) && (
                      <Badge variant="destructive" className="text-[10px]">
                        Atrasada
                      </Badge>
                    )}
                  </span>
                ) : (
                  <span>{t.due_date ? formatDateTimeBR(t.due_date, t.due_time) : "Sem prazo"}</span>
                )}
                <Badge variant="outline" className="text-[10px]">
                  {STATUS_LABEL[t.status]}
                </Badge>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
