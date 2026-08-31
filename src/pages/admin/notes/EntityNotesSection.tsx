import { Link } from "react-router-dom";
import { NotebookPen } from "lucide-react";
import type { Note } from "@/types/notes";

/**
 * "Notas" dentro da página de outra entidade (feature 056) — o vínculo de `note_link` visto do
 * outro lado: *quais notas falam desta meta/livro/viagem?*
 *
 * Deliberadamente **apresentacional**: quem carrega é a página, que sabe quantas entidades tem na
 * tela (a lista de metas, por exemplo, carrega todas de uma vez com `fetchNotesLinkedToMany` em vez
 * de uma consulta por card). Assim qualquer módulo pode reusar esta seção sem herdar uma estratégia
 * de carregamento que não serve para ele.
 *
 * Sem nota vinculada, não renderiza nada: um bloco "Notas" vazio em todo card seria ruído.
 */
export function EntityNotesSection({ notes }: { notes: readonly Note[] }) {
  if (notes.length === 0) return null;
  return (
    <div className="mt-3 border-t pt-2">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <NotebookPen className="h-3 w-3" aria-hidden="true" />
        Notas
      </p>
      <ul className="mt-1 space-y-0.5">
        {notes.map((note) => (
          <li key={note.id}>
            <Link
              to={`/notes/${note.id}`}
              className="block truncate text-xs text-primary hover:underline"
            >
              {note.title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
