import type { Note } from "@/types/notes";

/**
 * Filtro local da lista de notas: casa no título ou no conteúdo, sem diferenciar maiúscula nem
 * acento. É local de propósito — a lista inteira já está em memória, e ir ao banco a cada tecla
 * seria uma consulta por caractere. A busca *global* (`searchGlobal`) é outra coisa: essa vai ao
 * banco com `ilike` porque varre módulos que a página não carregou.
 *
 * Consulta vazia devolve tudo, na ordem recebida.
 */
export function filterNotes(notes: Note[], query: string): Note[] {
  const needle = foldForSearch(query);
  if (!needle) return notes;
  return notes.filter(
    (note) =>
      foldForSearch(note.title).includes(needle) ||
      foldForSearch(note.content).includes(needle)
  );
}

/** Minúscula e sem acento — "Reuniao" tem que achar "Reunião". */
function foldForSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
