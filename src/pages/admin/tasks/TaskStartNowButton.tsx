import { Zap } from "lucide-react";
import { ActionTooltip } from "@/components/ActionTooltip";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Texto por extenso do botão "Imediatamente" — o rótulo não cabe numa linha densa da lista, então
 * vive no tooltip e no `aria-label` (é por ele que os testes acham o botão). */
export const START_NOW_LABEL = "Imediatamente — começa agora e marca o prazo";

/**
 * Botão "Imediatamente" (feature 078): um clique inicia o timer da tarefa **e** grava o prazo como
 * agora + duração estimada. Vive num componente próprio, e não inline em `TaskViews.tsx`, porque
 * ele é a única superfície da feature — a `080` vai reorganizar o formulário/linha de tarefa e
 * precisa conseguir mover este botão inteiro sem reconstruir o comportamento.
 *
 * Traz o próprio `TooltipProvider`: `TaskListRow`/`KanbanCard` são renderizados em contextos que
 * nem sempre têm um provider acima (Radix lança sem ele), e aninhar providers é inofensivo.
 */
export function TaskStartNowButton({
  onClick,
  pending = false,
  /** `"row"` = linha da Lista (mesma caixa 8x8 do Play ao lado); `"card"` = card do Kanban, mais
   * apertado (7x7), acompanhando os botões que já estão lá. */
  size = "row",
  className,
}: {
  onClick: () => void;
  pending?: boolean;
  size?: "row" | "card";
  className?: string;
}) {
  const isRow = size === "row";
  return (
    <TooltipProvider delayDuration={300}>
      <ActionTooltip label={START_NOW_LABEL}>
        <Button
          variant="ghost"
          size="icon"
          disabled={pending}
          className={cn(
            isRow ? "h-8 w-8" : "h-7 w-7",
            "text-muted-foreground hover:text-foreground",
            className
          )}
          onClick={onClick}
          aria-label={START_NOW_LABEL}
        >
          <Zap className={isRow ? "h-3.5 w-3.5" : "h-3 w-3"} />
        </Button>
      </ActionTooltip>
    </TooltipProvider>
  );
}
