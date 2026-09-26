import { useMemo, useState } from "react";
import { ChevronDown, List } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { EmptyState } from "@/components/EmptyState";
import { extractHeadings } from "@/domain/notes/headings";
import type { NoteHeading } from "@/domain/notes/headings";
import { cn } from "@/lib/utils";

/**
 * # Sumário da nota (feature 070)
 *
 * Painel ao lado de "Vínculos"/"Mencionada em", com os títulos da nota indentados por nível. Numa
 * nota longa é a única forma de chegar a uma seção sem rolar procurando — que é metade do que
 * "escrever com sofisticação" significa em texto grande.
 *
 * O painel **não** sabe rolar nada: ele avisa qual título foi escolhido e quem monta o editor
 * decide como chegar lá (linha do CodeMirror no modo Escrever/Dividir, âncora no Visualizar). É a
 * mesma divisão do resto do módulo — a regra pura (`extractHeadings`) em `domain/`, o alvo com quem
 * tem o editor na mão.
 */

/** Recuo por nível. `h1` encosta na margem; cada nível abaixo anda um degrau. */
const INDENT: Record<number, string> = {
  1: "pl-0",
  2: "pl-3",
  3: "pl-6",
  4: "pl-9",
  5: "pl-12",
  6: "pl-14",
};

export function NoteOutlinePanel({
  content,
  onSelect,
}: {
  content: string;
  onSelect: (heading: NoteHeading) => void;
}) {
  const [open, setOpen] = useState(true);
  const headings = useMemo(() => extractHeadings(content), [content]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <section className="space-y-2" aria-labelledby="note-outline-heading">
        <div className="flex items-center justify-between gap-2">
          <h2
            id="note-outline-heading"
            className="flex items-center gap-2 text-sm font-semibold"
          >
            <List className="h-4 w-4" aria-hidden="true" />
            Sumário
          </h2>
          <CollapsibleTrigger
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            aria-label={open ? "Recolher sumário" : "Expandir sumário"}
          >
            <ChevronDown
              aria-hidden="true"
              className={cn("h-4 w-4 transition-transform", open ? "" : "-rotate-90")}
            />
          </CollapsibleTrigger>
        </div>

        <CollapsibleContent>
          {headings.length === 0 ? (
            <EmptyState
              icon={List}
              title="Sem títulos ainda"
              description="Comece uma linha com # para criar uma seção."
              className="py-6"
            />
          ) : (
            <ol className="space-y-0.5">
              {headings.map((heading) => (
                <li key={heading.slug}>
                  <button
                    type="button"
                    onClick={() => onSelect(heading)}
                    className={cn(
                      "w-full truncate rounded px-1.5 py-1 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
                      INDENT[heading.level] ?? "pl-14",
                      heading.level === 1 && "font-medium text-foreground"
                    )}
                  >
                    {/* Título vazio ainda precisa ser clicável — some do sumário seria pior. */}
                    {heading.text || "(sem título)"}
                  </button>
                </li>
              ))}
            </ol>
          )}
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}
