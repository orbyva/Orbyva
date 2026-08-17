import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth-user";
import type {
  Note,
  NoteLink,
  NoteLinkDraft,
  NoteLinkEntityType,
} from "@/types/notes";

/**
 * I/O de `public.note_link` (feature 056) — o vínculo N:N entre uma nota e qualquer entidade.
 *
 * Toda função filtra por `user_id` explicitamente, mesmo com RLS ligada: a RLS é a última linha de
 * defesa, não a primeira, e o filtro é o que faz a consulta usar os índices
 * `note_link_user_note_idx` / `note_link_user_entity_idx` (ambos começam por `user_id`).
 */

/** Vínculos de uma nota, mais antigos primeiro — a ordem em que foram criados. */
export async function fetchLinksForNote(noteId: string): Promise<NoteLink[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("note_link")
    .select("*")
    .eq("user_id", userId)
    .eq("note_id", noteId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * A consulta reversa: as notas ligadas a uma entidade — "quais notas falam desta meta?".
 *
 * Duas idas ao banco de propósito: `note_link` não tem FK para a entidade, e um `select` com join
 * embutido do PostgREST (`note(*)`) só funcionaria para a FK que existe (`note_id`). Aqui a
 * primeira consulta usa o índice `(user_id, entity_type, entity_id)` e a segunda busca as notas
 * pelos ids encontrados. Sem vínculo nenhum, a segunda nem acontece.
 */
export async function fetchNotesLinkedTo(
  entityType: NoteLinkEntityType,
  entityId: string
): Promise<Note[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("note_link")
    .select("note_id")
    .eq("user_id", userId)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId);
  if (error) throw new Error(error.message);

  const noteIds = [...new Set((data ?? []).map((row) => row.note_id))];
  if (noteIds.length === 0) return [];

  const { data: notes, error: notesError } = await supabase
    .from("note")
    .select("*")
    .eq("user_id", userId)
    .in("id", noteIds)
    .order("updated_at", { ascending: false });
  if (notesError) throw new Error(notesError.message);
  return notes ?? [];
}

/**
 * Cria o vínculo. `label` vazio vira `null` — a coluna é opcional e `''` só ocuparia espaço
 * fingindo que existe rótulo.
 *
 * O `unique (note_id, entity_type, entity_id)` do banco é quem garante que não há duplicata; aqui
 * não se tenta adivinhar antes, para não abrir corrida entre a checagem e o insert.
 */
export async function addNoteLink(draft: NoteLinkDraft): Promise<NoteLink> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("note_link")
    .insert([
      {
        note_id: draft.note_id,
        entity_type: draft.entity_type,
        entity_id: draft.entity_id,
        label: draft.label?.trim() ? draft.label.trim() : null,
        user_id: userId,
      },
    ])
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function removeNoteLink(id: string): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("note_link")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}
