import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Gatilho de **uma linha** (label + resumo do conteúdo + chevron) que revela o filho — o
 * progressive disclosure que faz Descrição, Subtarefas e Registros de tempo caberem no painel
 * denso do form de tarefa (feature 080) sem virar seis linhas de altura cada.
 *
 * **Por que não `@/components/ui/collapsible` (Radix)**: o `CollapsibleContent` desmonta o filho
 * ao fechar, e com `forceMount` ele nunca fica escondido (`children: isOpen && children` +
 * `hidden: !isOpen` no mesmo `isOpen`). Aqui o filho precisa continuar **montado** ao fechar —
 * fechar a Descrição no meio da digitação não pode perder o texto nem o estado da aba
 * Escrever/Visualizar. Daí o `hidden` manual: some da árvore de acessibilidade e do layout, mas o
 * React mantém o estado.
 */
export function CollapsibleField({
  label,
  summary,
  defaultOpen = false,
  lazy = false,
  children,
  className,
}: {
  label: string;
  /** Resumo do que está lá dentro, mostrado no gatilho quando há conteúdo (ex.: as primeiras
   * letras da descrição). Vazio/`null` = só o label. */
  summary?: string | null;
  defaultOpen?: boolean;
  /** Só monta o filho na **primeira** abertura (depois disso ele fica montado como sempre). Para
   * seções cujo conteúdo custa caro e não tem rascunho a preservar — o caso dos Registros de
   * tempo, que buscam da API ao montar: fechado não deve gerar requisição. */
  lazy?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [everOpened, setEverOpened] = useState(defaultOpen);
  const contentId = useId();

  return (
    <div className={cn("rounded-md border", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => {
          setOpen((prev) => !prev);
          setEverOpened(true);
        }}
        className="flex min-h-[44px] w-full items-center gap-2 px-2.5 py-2 text-left text-sm hover:bg-muted/50 sm:min-h-[36px] sm:py-1.5"
      >
        <span className="shrink-0 font-medium">{label}</span>
        {summary ? (
          <span className="truncate text-xs text-muted-foreground">{summary}</span>
        ) : null}
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
      <div id={contentId} hidden={!open} className="border-t px-2.5 py-2">
        {lazy && !everOpened ? null : children}
      </div>
    </div>
  );
}
