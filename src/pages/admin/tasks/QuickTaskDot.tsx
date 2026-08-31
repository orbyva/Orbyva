import { cn } from "@/lib/utils";
import { isDoseLate } from "@/domain/tasks";
import type { Task } from "@/types/tasks";
import { isVirtualTask, STATUS_DOT_CLASS } from "./AgendaGrid";
import { TaskIconBadge } from "./TaskIconBadge";
import { formatTimeOfDay } from "./TimeEntryRow";

/** `HH:mm` do prazo — o Postgres devolve `due_time` como `HH:mm:ss`, e a bolinha só mostra hora e
 * minuto. `null` quando a pontual não tem horário (fileira da faixa "Sem horário"). */
function quickDotTimeLabel(task: Pick<Task, "due_time">): string | null {
  return task.due_time ? task.due_time.slice(0, 5) : null;
}

/**
 * Previsto × tomado de uma dose de medicação (feature 071) — `null` para qualquer outra pontual.
 *
 * É o pedido literal do prompt ("eu devo ser capaz de ver a hora em que foi tomado, se está de
 * acordo com a hora que o evento/tarefa é criado"): a informação existia só no diálogo "Ocorrências
 * de…", e agora acompanha a bolinha onde ela é vista. Atraso é `isDoseLate` (`src/domain/tasks/
 * medication.ts`), a mesma tolerância de 60 minutos da 049 — sem uma segunda regra concorrente.
 */
function doseScheduleNote(task: Task): string | null {
  if (!task.medication_id) return null;

  const scheduled = quickDotTimeLabel(task);
  if (!scheduled) return null;

  const previsto = `Previsto ${scheduled}`;
  if (task.status !== "done" || !task.completed_at) return previsto;

  const tomado = `Tomado ${formatTimeOfDay(task.completed_at)}`;
  return `${previsto} · ${tomado}${isDoseLate(task) ? " (atrasada)" : ""}`;
}

/**
 * A bolinha da agenda (feature 070): uma tarefa pontual — trocar lençol, tomar remédio — desenhada
 * como um ponto marcável no horário, em vez de um bloco com altura sintética. Clicar alterna
 * concluída/pendente **direto**, sem abrir diálogo: é o pedido literal ("eu consiga marcar a
 * bolinha, ela fica verde").
 *
 * Regras que o teste cobre:
 * - concluída = preenchida com `STATUS_DOT_CLASS.done` (o mesmo verde do resto da agenda), com o
 *   ícone da tarefa (feature 035) em contraste por cima; pendente = só o contorno;
 * - ocorrência virtual (`virtual:`) é tracejada e desabilitada — não se conclui o que ainda não
 *   existe —, com o mesmo `title` explicativo do `TaskChip`;
 * - o `<button>` tem 24px de alvo de toque com um desenho de 16px dentro, `aria-pressed` e um
 *   `aria-label` que diz o que o clique faz ("Concluir «Losartana» às 08:00").
 *
 * Feature 071 — a dose de medicação é uma pontual como as outras, com dois acréscimos: o `title`/
 * `aria-label` carregam previsto × tomado (`doseScheduleNote`) e a dose tomada fora do horário ganha
 * um anel âmbar por cima do verde.
 */
export function QuickTaskDot({
  task,
  onToggle,
}: {
  task: Task;
  onToggle: (task: Task) => void;
}) {
  const virtual = isVirtualTask(task);
  const done = task.status === "done";
  const time = quickDotTimeLabel(task);
  const timeSuffix = time ? ` às ${time}` : "";
  const doseNote = doseScheduleNote(task);
  // Uma dose só ganha o anel âmbar quando foi tomada **fora** do horário: verde continua querendo
  // dizer "tomou", e o anel é o "mas atrasado" que o prompt diz ser o que importa controlar.
  const doseLate = !virtual && done && !!task.medication_id && isDoseLate(task);
  const doseSuffix = doseNote ? ` — ${doseNote}` : "";
  const ariaLabel = virtual
    ? `${task.title}${timeSuffix} — próxima ocorrência, ainda não criada`
    : `${done ? "Reabrir" : "Concluir"} «${task.title}»${timeSuffix}${doseSuffix}`;
  const titleAttr = virtual
    ? doseNote
      ? `Próxima ocorrência — ainda não criada, aparece automaticamente nesse dia (${doseNote})`
      : "Próxima ocorrência — ainda não criada, aparece automaticamente nesse dia"
    : doseNote
      ? `${task.title} · ${doseNote}`
      : time
        ? `${time} · ${task.title}`
        : task.title;

  return (
    <button
      type="button"
      disabled={virtual}
      aria-pressed={virtual ? undefined : done}
      aria-label={ariaLabel}
      title={titleAttr}
      onClick={() => onToggle(task)}
      className={cn(
        // 24px de alvo de toque em volta de um desenho de 16px — acessibilidade não é acabamento.
        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
        virtual ? "cursor-default" : "hover:bg-muted"
      )}
    >
      <span
        className={cn(
          "flex h-4 w-4 items-center justify-center rounded-full border transition-colors",
          virtual
            ? "border-dashed border-muted-foreground/60 opacity-60"
            : done
              ? cn(STATUS_DOT_CLASS.done, "border-transparent text-white")
              : "border-muted-foreground/60 text-muted-foreground",
          // Anel âmbar sobre o verde: dose tomada, mas fora do horário (feature 071).
          doseLate && "ring-2 ring-amber-500 ring-offset-1 ring-offset-background"
        )}
      >
        <TaskIconBadge
          iconKey={task.icon_key}
          iconUrl={task.icon_url}
          className={cn("h-2.5 w-2.5 rounded-full", done && "text-white")}
        />
      </span>
    </button>
  );
}
