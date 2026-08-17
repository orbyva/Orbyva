import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CornerUpLeft } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { fetchNotesMentioning } from "@/api/notes/notes";
import { fetchNotesSharingEntity } from "@/api/notes/noteLinks";
import { noteExcerpt } from "@/domain/notes/noteDraft";
import { mentionsWikiTitle } from "@/domain/notes/wikiLinks";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import type { Note } from "@/types/notes";

/**
 * "Mencionada em" (feature 056): quem aponta para esta nota.
 *
 * Duas origens, porque são os dois jeitos de uma nota apontar para outra neste app:
 *  - **wiki-link** — outra nota escreveu `[[<título desta>]]`. Derivado do texto, sem tabela de
 *    índice: um `ilike` acha as candidatas e `mentionsWikiTitle` confirma (menção dentro de bloco
 *    de código não conta). Reconciliar índice a cada save sairia do ar assim que alguém editasse o
 *    markdown por fora — ver Decisões da 056.
 *  - **`note_link`** — outra nota está ligada a alguma das mesmas entidades que esta. É a consulta
 *    reversa do índice `(user_id, entity_type, entity_id)` virada para o próprio módulo de Notas.
 *
 * Consequência assumida de resolver por título: renomear a nota derruba os backlinks que apontavam
 * para o nome antigo. É o comportamento do Obsidian, não um bug.
 */
export function BacklinksPanel({ note }: { note: Note }) {
  const [mentions, setMentions] = useState<Note[]>([]);
  const [related, setRelated] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [candidates, sharing] = await Promise.all([
        fetchNotesMentioning(note.title, note.id),
        fetchNotesSharingEntity(note.id),
      ]);
      // O `ilike` é prefiltro; o parser é quem decide o que é menção de verdade.
      setMentions(
        candidates.filter((other) => mentionsWikiTitle(other.content, note.title))
      );
      setRelated(sharing);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro ao carregar as menções",
        description: getErrorMessage(error),
      });
    } finally {
      setLoading(false);
    }
    // `note.title` entra de propósito: renomear a nota muda quem aponta para ela.
  }, [note.id, note.title, toast]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section className="space-y-2" aria-labelledby="note-backlinks-heading">
      <h2
        id="note-backlinks-heading"
        className="flex items-center gap-2 text-sm font-semibold"
      >
        <CornerUpLeft className="h-4 w-4" aria-hidden="true" />
        Mencionada em
      </h2>

      {loading ? (
        <p className="text-xs text-muted-foreground">Procurando menções…</p>
      ) : mentions.length === 0 && related.length === 0 ? (
        <EmptyState
          icon={CornerUpLeft}
          title="Nenhuma nota aponta para esta"
          description="Escreva [[o título desta nota]] em outra nota para criar a ligação."
          className="py-8"
        />
      ) : (
        <div className="space-y-3">
          <NoteMentionList
            notes={mentions}
            caption={`Com [[${note.title}]] no texto`}
          />
          <NoteMentionList
            notes={related}
            caption="Ligadas às mesmas coisas que esta"
          />
        </div>
      )}
    </section>
  );
}

function NoteMentionList({
  notes,
  caption,
}: {
  notes: Note[];
  caption: string;
}) {
  if (notes.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {caption}
      </p>
      <ul className="space-y-1.5">
        {notes.map((note) => {
          const excerpt = noteExcerpt(note.content, 100);
          return (
            <li key={note.id}>
              <Link
                to={`/notes/${note.id}`}
                className="block rounded-lg border bg-card p-2.5 transition-colors hover:border-primary/40"
              >
                <span className="block truncate text-sm font-medium">
                  {note.title}
                </span>
                {excerpt && (
                  <span className="mt-0.5 block line-clamp-2 text-xs text-muted-foreground">
                    {excerpt}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
