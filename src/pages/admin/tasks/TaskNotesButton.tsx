import { useState } from "react";
import { Link } from "react-router-dom";
import { NotebookPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDateBR } from "@/lib/currency";
import { cn } from "@/lib/utils";
import type { Note } from "@/types/notes";

/**
 * "Esta tarefa tem nota" na própria linha (feature 255) — o vínculo de `note_link` (feature 056)
 * visto de fora do formulário.
 *
 * Três situações, e só três:
 * - **nenhuma nota** → não renderiza nada. Mesma regra do `EntityNotesSection` e do
 *   `ExpandSubtasksButton`: ícone morto em toda linha seria ruído num grupo de ações que já tem
 *   timer, "Imediatamente", editar, excluir e expandir.
 * - **uma nota** → o botão *é* o link para ela. Sem popover no meio: é o caso comum, e o clique
 *   já sabe para onde vai.
 * - **mais de uma** → expande a lista, porque aí a linha não tem como escolher pelo usuário. A
 *   contagem aparece ao lado do ícone para o clique não surpreender.
 *
 * Deliberadamente **apresentacional**: recebe as notas prontas, carregadas em lote por quem
 * monta a tela (`fetchNotesLinkedToMany`), nunca uma consulta por linha.
 */
export function TaskNotesButton({
  notes,
  size = "row",
}: {
  notes: readonly Note[];
  /** `row` = linha da Lista (botões h-8, como o Play); `card` = card do Kanban (h-7). */
  size?: "row" | "card";
}) {
  const [open, setOpen] = useState(false);
  if (notes.length === 0) return null;

  const box = size === "row" ? "h-8" : "h-7";
  const glyph = size === "row" ? "h-3.5 w-3.5" : "h-3 w-3";
  const tone = "text-muted-foreground hover:text-foreground";

  if (notes.length === 1) {
    const note = notes[0];
    return (
      <Button
        variant="ghost"
        size="icon"
        className={cn(box, size === "row" ? "w-8" : "w-7", tone)}
        aria-label={`Abrir nota: ${note.title}`}
        title={note.title}
        asChild
      >
        <Link to={`/notes/${note.id}`}>
          <NotebookPen className={glyph} aria-hidden="true" />
        </Link>
      </Button>
    );
  }

  const label = `Notas desta tarefa — ${notes.length}`;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(box, "w-auto gap-0.5 px-1.5", tone)}
          aria-label={label}
          title={label}
        >
          <NotebookPen className={glyph} aria-hidden="true" />
          <span className="text-[10px] font-semibold leading-none">{notes.length}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="end" aria-label="Notas desta tarefa">
        <p className="px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Notas desta tarefa
        </p>
        <ul className="mt-1 space-y-0.5">
          {notes.map((note) => (
            <li key={note.id}>
              <Link
                to={`/notes/${note.id}`}
                onClick={() => setOpen(false)}
                className="block rounded-sm px-1 py-1 hover:bg-muted"
              >
                <span className="block truncate text-xs">{note.title}</span>
                {note.updated_at && (
                  <span className="block text-[10px] text-muted-foreground">
                    Editada em {formatDateBR(note.updated_at)}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
