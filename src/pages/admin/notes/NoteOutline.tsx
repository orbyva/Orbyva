import { useMemo, useState } from "react";
import { ChevronDown, List } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  OUTLINE_MIN_HEADINGS,
  extractHeadings,
} from "@/domain/notes/outline";
import type { NoteHeading } from "@/domain/notes/outline";
import { cn } from "@/lib/utils";

/**
 * # Sumário da nota (feature 068)
 *
 * Painel lateral com os títulos, derivado do **texto** (`extractHeadings`) e não do HTML — o
 * sumário precisa existir enquanto se escreve, e na aba "Escrever" não há preview nenhum na tela.
 *
 * Três regras de aparecer/sumir, todas deliberadas:
 * - **menos de dois títulos, não renderiza nada**: uma lista de um item ao lado do texto ocupa
 *   largura e não orienta ninguém;
 * - **abaixo de `lg`, não aparece**: em telefone não há largura para duas colunas legíveis, e o
 *   sumário perderia para o texto;
 * - **é colapsável**, porque numa nota de trinta títulos o painel vira a coisa mais alta da tela.
 *
 * Quem navega é o pai (`onSelect`): na aba "Visualizar" o destino é a âncora `id` que a 067 gera;
 * na aba "Escrever", a linha do Markdown. O painel não sabe — nem deveria — em qual das duas está.
 */
export function NoteOutline({
  content,
  activeSlug,
  onSelect,
  className,
}: {
  content: string;
  /** Seção "atual" — no editor, a que contém o cursor. */
  activeSlug?: string | null;
  onSelect: (heading: NoteHeading) => void;
  className?: string;
}) {
  const headings = useMemo(() => extractHeadings(content), [content]);
  const [open, setOpen] = useState(true);

  if (headings.length < OUTLINE_MIN_HEADINGS) return null;

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      // `hidden lg:block`: a media query decide, não JavaScript — assim não há um instante em que
      // o painel aparece e some, e o teste consegue afirmar a classe.
      className={cn("hidden w-52 shrink-0 lg:block", className)}
    >
      <CollapsibleTrigger className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground">
        <List aria-hidden="true" className="h-3.5 w-3.5" />
        Sumário
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "ml-auto h-3.5 w-3.5 transition-transform",
            !open && "-rotate-90"
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <nav aria-label="Sumário da nota">
          <ol className="mt-1 space-y-0.5">
            {headings.map((heading) => (
              <li key={`${heading.slug}-${heading.line}`}>
                <button
                  type="button"
                  onClick={() => onSelect(heading)}
                  // `aria-current` e não só uma cor: quem usa leitor de tela também precisa saber
                  // em que seção está.
                  aria-current={heading.slug === activeSlug ? "true" : undefined}
                  className={cn(
                    "block w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-accent hover:text-accent-foreground",
                    heading.slug === activeSlug
                      ? "bg-accent font-medium text-accent-foreground"
                      : "text-muted-foreground"
                  )}
                  // A hierarquia vira recuo: nível 1 sem recuo, e 8px por nível abaixo dele.
                  style={{ paddingLeft: `${0.5 + (heading.level - 1) * 0.5}rem` }}
                  title={heading.text}
                >
                  {heading.text}
                </button>
              </li>
            ))}
          </ol>
        </nav>
      </CollapsibleContent>
    </Collapsible>
  );
}
