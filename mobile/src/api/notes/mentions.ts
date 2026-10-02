import { mentionsWikiTitle } from "@/domain/notes/wikiLinks";
import { mentionsTaskId, TASK_REF_SCHEME } from "@/domain/tasks/taskRefs";
import { getCurrentUserId } from "@/lib/auth-user";
import { escapeLikeValue } from "@/lib/likePattern";
import { supabase } from "@/lib/supabase";
import type { Note, NoteLinkEntityType } from "@/types/notes";

/**
 * Backlinks derivados do texto, como na web: o `ilike` é só prefiltro e o parser do domínio decide
 * o que é menção de verdade (marca dentro de bloco de código não conta).
 */

const NOTE_SELECT =
  "id, title, content, kind, canvas_data, project_id, folder_id, updated_at";

export type MentionRow = { id: string; title: string };

/** Notas com `[[<título>]]` no texto, sem a própria nota. */
export async function fetchNotesMentioningTitle(
  title: string,
  excludeNoteId?: string
): Promise<Note[]> {
  const target = title.trim();
  if (!target) return [];
  const userId = await getCurrentUserId();
  let query = supabase
    .from("note")
    .select(NOTE_SELECT)
    .eq("user_id", userId)
    .ilike("content", `%[[${escapeLikeValue(target)}]]%`);
  if (excludeNoteId) query = query.neq("id", excludeNoteId);
  const { data, error } = await query.order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Note[]).filter((note) =>
    mentionsWikiTitle(note.content ?? "", target)
  );
}

/** Outras notas ligadas (`note_link`) a alguma das mesmas entidades desta. */
export async function fetchNotesSharingEntity(noteId: string): Promise<Note[]> {
  const userId = await getCurrentUserId();
  const { data: own, error: ownError } = await supabase
    .from("note_link")
    .select("entity_type, entity_id")
    .eq("user_id", userId)
    .eq("note_id", noteId);
  if (ownError) throw new Error(ownError.message);
  const ownLinks = (own ?? []) as { entity_type: string; entity_id: string }[];
  if (ownLinks.length === 0) return [];

  const wanted = new Set(ownLinks.map((l) => `${l.entity_type}:${l.entity_id}`));
  const { data, error } = await supabase
    .from("note_link")
    .select("note_id, entity_type, entity_id")
    .eq("user_id", userId)
    .in("entity_id", [...new Set(ownLinks.map((l) => l.entity_id))]);
  if (error) throw new Error(error.message);
  const noteIds = [
    ...new Set(
      ((data ?? []) as { note_id: string; entity_type: string; entity_id: string }[])
        .filter(
          (row) =>
            row.note_id !== noteId && wanted.has(`${row.entity_type}:${row.entity_id}`)
        )
        .map((row) => row.note_id)
    ),
  ];
  return fetchNotesByIds(noteIds);
}

/** Notas ligadas a uma entidade (meta, tarefa, projeto…) por `note_link`. */
export async function fetchNotesLinkedTo(
  entityType: NoteLinkEntityType,
  entityId: string
): Promise<Note[]> {
  const byEntity = await fetchNotesLinkedToMany(entityType, [entityId]);
  return byEntity[entityId] ?? [];
}

/** A mesma consulta para várias entidades de uma vez (duas idas ao banco no total). */
export async function fetchNotesLinkedToMany(
  entityType: NoteLinkEntityType,
  entityIds: readonly string[]
): Promise<Record<string, Note[]>> {
  const ids = [...new Set(entityIds.filter(Boolean))];
  if (ids.length === 0) return {};
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("note_link")
    .select("note_id, entity_id")
    .eq("user_id", userId)
    .eq("entity_type", entityType)
    .in("entity_id", ids);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { note_id: string; entity_id: string }[];
  const notes = await fetchNotesByIds([...new Set(rows.map((row) => row.note_id))]);
  const byId = new Map(notes.map((note) => [note.id, note]));
  const grouped: Record<string, Note[]> = {};
  for (const row of rows) {
    const note = byId.get(row.note_id);
    if (!note) continue;
    const bucket = (grouped[row.entity_id] ??= []);
    if (!bucket.some((existing) => existing.id === note.id)) bucket.push(note);
  }
  return grouped;
}

/** "Referenciada em": notas e tarefas cujo texto traz `[Rótulo](orbyva-task:<id>)`. */
export async function fetchTaskMentions(
  taskId: string
): Promise<{ notes: MentionRow[]; tasks: MentionRow[] }> {
  const target = taskId.trim();
  if (!target) return { notes: [], tasks: [] };
  const userId = await getCurrentUserId();
  const pattern = `%${escapeLikeValue(`${TASK_REF_SCHEME}${target}`)}%`;
  const [notes, tasks] = await Promise.all([
    supabase
      .from("note")
      .select("id, title, content")
      .eq("user_id", userId)
      .ilike("content", pattern)
      .order("updated_at", { ascending: false }),
    supabase
      .from("task")
      .select("id, title, description")
      .eq("user_id", userId)
      .neq("id", target)
      .ilike("description", pattern)
      .order("updated_at", { ascending: false }),
  ]);
  if (notes.error) throw new Error(notes.error.message);
  if (tasks.error) throw new Error(tasks.error.message);
  return {
    notes: ((notes.data ?? []) as { id: string; title: string; content: string | null }[])
      .filter((note) => mentionsTaskId(note.content ?? "", target))
      .map(({ id, title }) => ({ id, title })),
    tasks: ((tasks.data ?? []) as { id: string; title: string; description: string | null }[])
      .filter((task) => mentionsTaskId(task.description ?? "", target))
      .map(({ id, title }) => ({ id, title })),
  };
}

async function fetchNotesByIds(noteIds: string[]): Promise<Note[]> {
  if (noteIds.length === 0) return [];
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("note")
    .select(NOTE_SELECT)
    .eq("user_id", userId)
    .in("id", noteIds)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Note[];
}
