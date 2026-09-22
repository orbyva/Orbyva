import { CheckCircle2, Circle, CircleDashed, Unlink } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatDateBR } from "@/lib/currency";
import { cn } from "@/lib/utils";
import type { TaskRefSummary, TaskStatus } from "@/types/tasks";

/**
 * O chip de uma referência `[Rótulo](orbyva-task:<id>)` **fora do editor** (feature 105).
 *
 * É a metade visível da rastreabilidade: dentro do editor a marca é texto colorido (104), aqui ela
 * vira o **estado atual** da tarefa — ícone de status, título e, havendo, prazo. O título vem do
 * índice resolvido por id, nunca do rótulo escrito no texto: renomear a tarefa não reescreve quem
 * a citou, e mostrar o rótulo velho faria o texto mentir.
 *
 * **Não se conclui a tarefa por aqui.** O clique tem um significado só — abrir a tarefa em
 * `/tasks?task=<id>` (destino da 102). Marcar concluída dentro de um texto que também é editável
 * misturaria dois modos no mesmo clique (decisão da feature).
 *
 * Duas densidades: completa na prévia da nota, `compact` no card da lista — ali o espaço é de
 * `line-clamp-2` e o prazo empurraria o texto para fora.
 */

const STATUS_ICONS: Record<TaskStatus, LucideIcon> = {
  todo: Circle,
  doing: CircleDashed,
  done: CheckCircle2,
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "A fazer",
  doing: "Fazendo",
  done: "Feito",
};

/**
 * Ícones e rótulos repetidos aqui em vez de importados de `TaskViews.tsx`, de propósito: aquele
 * módulo é a lista de tarefas inteira (Kanban, Gantt, quadrantes) e importá-lo colaria tudo isso no
 * chunk de Notas, que monta este chip pela prévia. Mesma razão já medida na 104 para
 * `@/api/tasks/tasks`. São seis linhas de constante contra um grafo de módulo.
 */

/** Rótulo do chip quando a tarefa sumiu e o texto não deixou rótulo nenhum (`[](orbyva-task:…)`). */
const REMOVED_FALLBACK = "Tarefa";

export function TaskRefChip({
  id,
  label,
  task,
  compact = false,
  className,
}: {
  /** Id citado no texto — o destino do clique. */
  id: string;
  /** Rótulo como está escrito no texto. Só aparece quando a tarefa não resolve. */
  label?: string;
  /** A tarefa resolvida (`useTaskRefIndex`). Ausente = referência removida. */
  task?: TaskRefSummary | null;
  /** Densidade do card: esconde o prazo, mantém título e ícone. */
  compact?: boolean;
  className?: string;
}) {
  const navigate = useNavigate();

  const base =
    "inline-flex max-w-full items-center gap-1 rounded border px-1.5 py-0 align-baseline text-xs";

  if (!task) {
    const text = label?.trim() || REMOVED_FALLBACK;
    return (
      <span
        // Sem link: não há para onde levar. O texto de quem escreveu continua intacto — apagar a
        // tarefa não autoriza reescrever o markdown de ninguém (decisão da 105, herdada da 056).
        role="note"
        title={`A tarefa referenciada não existe mais (${text}).`}
        aria-label={`Referência removida: a tarefa ${text} não existe mais.`}
        className={cn(
          base,
          "border-dashed border-muted-foreground/40 text-muted-foreground opacity-70",
          className
        )}
      >
        <Unlink className="h-3 w-3 shrink-0" aria-hidden="true" />
        {/* Sem traço no texto: o traço significa "concluída" no chip resolvido, e repeti-lo aqui
            faria "apagada" e "feita" parecerem a mesma coisa. */}
        <span className="truncate">{text}</span>
      </span>
    );
  }

  const StatusIcon = STATUS_ICONS[task.status];
  const done = task.status === "done";
  const due = task.due_date ? formatDateBR(task.due_date) : null;
  const href = `/tasks?task=${encodeURIComponent(id)}`;
  const description = [
    `Tarefa: ${task.title}`,
    STATUS_LABELS[task.status],
    due ? `prazo ${due}` : null,
  ]
    .filter(Boolean)
    .join(" — ");

  return (
    <a
      href={href}
      title={description}
      aria-label={description}
      // `onPointerDown` + `stopPropagation`: o card inteiro da lista é clicável por baixo, e sem
      // isto o clique no chip abriria o formulário da tarefa que **contém** o texto, não a
      // referenciada. Mesmo cuidado de `TaskDescriptionSnippet`, e `pointerdown` (não `click`)
      // porque o Dialog do Radix engole o `click` no trap de foco.
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        // Ctrl/Cmd/Shift/Alt e botão do meio seguem o href nativo (nova aba, nova janela).
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        if (event.button !== 0) return;
        event.preventDefault();
        navigate(href);
      }}
      className={cn(
        base,
        "border-primary/30 bg-primary/10 text-primary no-underline transition-colors hover:border-primary hover:bg-primary/15",
        className
      )}
    >
      <StatusIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span className={cn("truncate", done && "line-through opacity-80")}>{task.title}</span>
      {!compact && due && (
        <span className="shrink-0 text-[10px] text-muted-foreground">{due}</span>
      )}
    </a>
  );
}
