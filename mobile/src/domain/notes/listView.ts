import type { Note } from "@/types/notes";

export const UNTITLED_NOTE_TITLE = "Sem título";
export const NOTE_TITLE_MAX = 120;

export function normalizeNoteTitle(title: string): string {
  const trimmed = title.trim().slice(0, NOTE_TITLE_MAX).trim();
  return trimmed || UNTITLED_NOTE_TITLE;
}

export function noteExcerpt(content: string, max = 120): string {
  for (const raw of content.split("\n")) {
    const line = raw.replace(/^#{1,6}\s+/, "").replace(/[`*_]/g, "").trim();
    if (!line || /^(-{3,}|\*{3,}|_{3,}|```|~~~)/.test(line)) continue;
    if (line.length <= max) return line;
    const head = line.slice(0, max);
    const lastSpace = head.lastIndexOf(" ");
    const cut = lastSpace > 0 ? head.slice(0, lastSpace) : head;
    return `${cut.trimEnd()}…`;
  }
  return "";
}

export const NOTE_PROJECT_ALL = "all";
export const NOTE_PROJECT_NONE = "none";

export function filterNotes(notes: Note[], query: string): Note[] {
  const needle = query.trim().toLocaleLowerCase("pt-BR");
  if (!needle) return notes;
  return notes.filter(
    (note) =>
      note.title.toLocaleLowerCase("pt-BR").includes(needle) ||
      note.content.toLocaleLowerCase("pt-BR").includes(needle)
  );
}

export function filterNotesByProject(
  notes: Note[],
  projectFilter: string
): Note[] {
  if (projectFilter === NOTE_PROJECT_ALL) return notes;
  if (projectFilter === NOTE_PROJECT_NONE) {
    return notes.filter((note) => !note.project_id);
  }
  return notes.filter((note) => note.project_id === projectFilter);
}
