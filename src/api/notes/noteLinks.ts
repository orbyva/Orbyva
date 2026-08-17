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
  const byEntity = await fetchNotesLinkedToMany(entityType, [entityId]);
  return byEntity[entityId] ?? [];
}

/**
 * A mesma consulta reversa para **várias** entidades de uma vez, agrupada por `entity_id`.
 *
 * Existe porque a lista de metas mostra as notas de cada meta: uma chamada por card seria uma ida
 * ao banco por meta na abertura da página. Aqui são duas, independentemente de quantas entidades.
 * `fetchNotesLinkedTo` é o caso de uma entidade só, delegando para cá — implementação única.
 */
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

  const rows = data ?? [];
  const noteIds = [...new Set(rows.map((row) => row.note_id))];
  if (noteIds.length === 0) return {};

  const { data: notes, error: notesError } = await supabase
    .from("note")
    .select("*")
    .eq("user_id", userId)
    .in("id", noteIds)
    .order("updated_at", { ascending: false });
  if (notesError) throw new Error(notesError.message);

  const byId = new Map((notes ?? []).map((note) => [note.id, note]));
  const grouped: Record<string, Note[]> = {};
  for (const row of rows) {
    const note = byId.get(row.note_id);
    // Nota invisível pela RLS (ou apagada entre as duas consultas) não entra na lista.
    if (!note) continue;
    const bucket = (grouped[row.entity_id] ??= []);
    // A mesma nota pode ter dois vínculos para a mesma entidade? O `unique` do banco impede — mas
    // duas linhas de tipos diferentes com o mesmo `entity_id` não, e o filtro por tipo acima já
    // resolve. Este `some` é a rede para o caso de a consulta mudar.
    if (!bucket.some((existing) => existing.id === note.id)) bucket.push(note);
  }
  return grouped;
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

/**
 * Outras notas que apontam para **alguma das mesmas entidades** que esta — "notas ligadas às mesmas
 * coisas" (feature 056).
 *
 * É a consulta reversa do índice `(user_id, entity_type, entity_id)` aplicada ao próprio módulo de
 * Notas: se duas notas falam da mesma meta, uma acha a outra sem ninguém ter escrito wiki-link.
 * O par `(entity_type, entity_id)` é conferido em memória porque o `in` do PostgREST filtra uma
 * coluna por vez, e dois tipos diferentes poderiam, em tese, compartilhar um id.
 */
export async function fetchNotesSharingEntity(noteId: string): Promise<Note[]> {
  const userId = await getCurrentUserId();
  const own = await fetchLinksForNote(noteId);
  if (own.length === 0) return [];

  const wanted = new Set(own.map((link) => `${link.entity_type}:${link.entity_id}`));
  const { data, error } = await supabase
    .from("note_link")
    .select("note_id, entity_type, entity_id")
    .eq("user_id", userId)
    .in("entity_id", [...new Set(own.map((link) => link.entity_id))]);
  if (error) throw new Error(error.message);

  const noteIds = [
    ...new Set(
      (data ?? [])
        .filter(
          (row) =>
            row.note_id !== noteId &&
            wanted.has(`${row.entity_type}:${row.entity_id}`)
        )
        .map((row) => row.note_id)
    ),
  ];
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

export async function removeNoteLink(id: string): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("note_link")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}
