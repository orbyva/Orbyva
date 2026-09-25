import { Check } from "lucide-react";
import type { Task } from "@/types/tasks";
import { cn } from "@/lib/utils";
import { isVirtualTask } from "./AgendaGrid";

/** Quantas bolinhas cabem numa fileira antes de virar "+N" — acima disso a fileira estouraria a
 * largura de uma célula de dia do mês / coluna de dia da semana. */
export const POINT_DOTS_MAX_VISIBLE = 8;

/** Rótulo de horário da bolinha (`HH:mm`), ou vazio quando a tarefa pontual não tem hora marcada
 * ("trocar lençol" raramente tem). */
function timeLabel(task: Task): string {
  return task.due_time ? task.due_time.slice(0, 5) : "";
}

function dotTitle(task: Task, virtual: boolean): string {
  const time = timeLabel(task);
  const base = time ? `${task.title} (${time})` : task.title;
  return virtual ? `${base} — ocorrência futura, ainda não criada` : base;
}

function dotAriaLabel(task: Task, interactive: boolean): string {
  const time = timeLabel(task);
  const base = time ? `${task.title} (${time})` : task.title;
  if (!interactive) return base;
  return task.status === "done" ? `Reabrir: ${base}` : `Concluir: ${base}`;
}

/**
 * Fileira de bolinhas marcáveis das tarefas **pontuais** de um horário (feature 072): coisas que
 * acontecem num instante — remédio, trocar lençol, trocar escova — que não fazem sentido como
 * bloco retangular de 30 minutos na grade.
 *
 * A bolinha **é** o botão de concluir, e é a única ação dela: um clique alterna `todo`/`done` e ela
 * fica verde (`--success`, o mesmo verde de "feito" de `HabitWeekStrip`). Sem `onToggle` a fileira
 * é só leitura — é assim que o Gantt ("Focar dia") a recebe.
 *
 * Nunca renderize esta fileira dentro de um `<button>`: botão dentro de botão é HTML inválido e o
 * clique se perde. Ela é irmã dos chips, nunca filha deles.
 */
export function PointTaskDots({
  items,
  onToggle,
  onOverflowClick,
  className,
  label = "Tarefas pontuais",
}: {
  items: Task[];
  /** Ausente = fileira só de leitura (Gantt). */
  onToggle?: (task: Task) => void;
  /** Clique no "+N" quando a fileira estoura `POINT_DOTS_MAX_VISIBLE`. */
  onOverflowClick?: () => void;
  className?: string;
  label?: string;
}) {
  if (items.length === 0) return null;

  const visible = items.slice(0, POINT_DOTS_MAX_VISIBLE);
  const overflow = items.length - visible.length;

  return (
    <div role="group" aria-label={label} className={cn("flex flex-wrap items-center gap-1", className)}>
      {visible.map((task) => {
        const virtual = isVirtualTask(task);
        const done = task.status === "done";
        // Ocorrência virtual não pode ser concluída: marcar criaria linha no banco por um gesto
        // que o usuário espera ser trivial (mesma regra de `TaskChip`/`TimedTaskBlock`).
        const interactive = !!onToggle && !virtual;
        return (
          <button
            key={task.id}
            type="button"
            disabled={!interactive}
            aria-pressed={interactive ? done : undefined}
            aria-label={dotAriaLabel(task, interactive)}
            title={dotTitle(task, virtual)}
            onClick={interactive ? () => onToggle?.(task) : undefined}
            className={cn(
              "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border transition-colors",
              done
                ? "border-success bg-success text-success-foreground"
                : "border-muted-foreground/40",
              virtual && "cursor-default opacity-60",
              interactive && "cursor-pointer",
              interactive && !done && "hover:border-primary",
              !interactive && !virtual && "cursor-default"
            )}
          >
            {done && <Check className="h-2.5 w-2.5" aria-hidden="true" />}
          </button>
        );
      })}
      {overflow > 0 && (
        <button
          type="button"
          onClick={onOverflowClick}
          disabled={!onOverflowClick}
          className={cn(
            "shrink-0 rounded px-0.5 text-[10px] leading-none text-muted-foreground",
            onOverflowClick && "hover:bg-muted hover:text-foreground"
          )}
        >
          +{overflow}
        </button>
      )}
    </div>
  );
}
