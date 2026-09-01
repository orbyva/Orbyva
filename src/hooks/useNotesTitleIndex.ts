import { useEffect, useMemo, useState } from "react";
import { fetchNotes } from "@/api/notes/notes";
import { indexNotesByTitle } from "@/domain/notes/wikiLinks";

/**
 * Índice título → id das notas, com cache no módulo — o mesmo motivo de `useLinkIconRules`:
 * cada card da lista monta o snippet, e N cards não podem disparar N `fetchNotes`.
 *
 * Falha resolve para mapa vazio: o `[[wiki-link]]` fica texto, a lista de tarefas continua.
 */

const EMPTY: { id: string; title: string }[] = [];

let cache: { id: string; title: string }[] | null = null;
let pending: Promise<{ id: string; title: string }[]> | null = null;

function load(): Promise<{ id: string; title: string }[]> {
  if (cache) return Promise.resolve(cache);
  if (!pending) {
    pending = fetchNotes()
      .then((notes) => {
        cache = notes.map((note) => ({ id: note.id, title: note.title }));
        return cache;
      })
      .catch((error) => {
        console.error("Não foi possível carregar as notas para os wiki-links da lista.", error);
        cache = EMPTY;
        return EMPTY;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

/** Zera o cache — os testes precisam, senão o mock da 1ª suíte vaza pra 2ª. */
export function invalidateNotesTitleIndex(): void {
  cache = null;
  pending = null;
}

export function useNotesTitleIndex(): Map<string, string> {
  const [notes, setNotes] = useState<{ id: string; title: string }[]>(() => cache ?? EMPTY);

  useEffect(() => {
    let cancelled = false;
    void load().then((next) => {
      if (!cancelled) setNotes(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(() => indexNotesByTitle(notes), [notes]);
}
