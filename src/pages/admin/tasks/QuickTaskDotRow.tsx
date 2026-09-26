import { cn } from "@/lib/utils";
import type { Task } from "@/types/tasks";
import { QuickTaskDot } from "./QuickTaskDot";

/** Quantas bolinhas cabem numa fileira antes do `+N` — a fileira quebra linha quando a coluna do
 * dia é estreita, mas sem um teto uma série diária de remédios encheria a célula do mês. */
export const QUICK_DOTS_MAX_VISIBLE = 6;

/**
 * A fileira de bolinhas de um horário (feature 070): "uma na frente da outra", como o prompt pede.
 * As pontuais do mesmo slot (ver `groupQuickItemsBySlot`) ficam lado a lado, com quebra de linha, e
 * o que passar de `maxVisible` vira um `+N` — que é um dos dois caminhos para abrir/editar uma
 * pontual (o outro é o número do dia), já que o clique na bolinha é só concluir/reabrir.
 *
 * Usada nas três visões: dentro da célula do dia no mês, na faixa "Sem horário" e como faixa
 * absoluta no canvas de horas de semana/dia. Ponto de reuso da feature 071.
 */
export function QuickTaskDotRow({
  tasks,
  onToggle,
  onOverflow,
  maxVisible = QUICK_DOTS_MAX_VISIBLE,
  label,
  className,
}: {
  tasks: Task[];
  onToggle: (task: Task) => void;
  /** Clique no `+N` — abre o modal do dia, onde as pontuais aparecem como chips normais. Sem
   * callback, o `+N` não é renderizado (as bolinhas extras simplesmente não aparecem). */
  onOverflow?: () => void;
  maxVisible?: number;
  /** Rótulo acessível da fileira (ex.: "Tarefas pontuais às 08:00"). */
  label?: string;
  className?: string;
}) {
  if (tasks.length === 0) return null;
  const visible = onOverflow ? tasks.slice(0, maxVisible) : tasks;
  const overflow = tasks.length - visible.length;

  return (
    <div
      role="group"
      aria-label={label}
      className={cn("flex flex-wrap items-center gap-0.5", className)}
    >
      {visible.map((task) => (
        <QuickTaskDot key={task.id} task={task} onToggle={onToggle} />
      ))}
      {overflow > 0 && onOverflow && (
        <button
          type="button"
          onClick={onOverflow}
          aria-label={
            overflow > 1
              ? `Ver mais ${overflow} tarefas pontuais`
              : "Ver mais 1 tarefa pontual"
          }
          className="shrink-0 rounded px-1 text-[10px] leading-4 text-muted-foreground hover:bg-muted"
        >
          +{overflow}
        </button>
      )}
    </div>
  );
}
