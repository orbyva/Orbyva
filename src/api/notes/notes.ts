import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth-user";
import { normalizeNoteDraft } from "@/domain/notes/noteDraft";
import type { Note, NoteDraft, NoteUpdateRequest } from "@/types/notes";

export interface FetchNotesOptions {
  /**
   * Restringe às notas de um projeto. Nulo/omitido = sem filtro, devolve todas — inclusive as
   * soltas. Com filtro, `project_id is null` fica de fora: nota solta não pertence a projeto nenhum
   * (mesma regra de `fetchShoppingCategories`).
   */
  projectId?: string | null;
}

/** Notas do usuário, editada mais recentemente primeiro — a ordem que `note_user_updated_idx` cobre. */
export async function fetchNotes(
  options: FetchNotesOptions = {}
): Promise<Note[]> {
  const userId = await getCurrentUserId();
  let query = supabase.from("note").select("*").eq("user_id", userId);
  if (options.projectId) query = query.eq("project_id", options.projectId);
  const { data, error } = await query.order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * A contagem do gatilho da aba do projeto mora em `countProjectDocuments`
 * (`src/api/notes/projectDocuments.ts`) desde a feature 105: contar só `project_id`, como o antigo
 * `countNotesByProject` fazia, passou a discordar da lista — que agora é a união de três origens.
 */

/** Uma nota pelo id. `null` quando não existe (ou é de outro usuário — a RLS a esconde). */
export async function fetchNote(id: string): Promise<Note | null> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("note")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function createNote(draft: NoteDraft): Promise<Note> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("note")
    .insert([{ ...normalizeNoteDraft(draft), user_id: userId }])
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Grava as alterações e carimba `updated_at` — sem isso a lista, ordenada por `updated_at desc`,
 * não reagiria à edição. Só normaliza o que veio: um update parcial de conteúdo não deve inventar
 * título.
 */
export async function updateNote(request: NoteUpdateRequest): Promise<void> {
  const userId = await getCurrentUserId();
  const { id, ...fields } = request;
  const patch: Record<string, unknown> = {
    ...fields,
    updated_at: new Date().toISOString(),
  };
  if (fields.title !== undefined) {
    patch.title = normalizeNoteDraft({
      title: fields.title,
      content: "",
      project_id: null,
    }).title;
  }
  if (fields.project_id !== undefined) {
    patch.project_id = fields.project_id ? fields.project_id : null;
  }
  const { error } = await supabase
    .from("note")
    .update(patch)
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/**
 * Candidatas a backlink: notas cujo `content` contém `[[<title>]]` (feature 056).
 *
 * O `ilike` é **prefiltro**, não veredito — ele acha a string, mas não sabe que `[[x]]` dentro de
 * bloco de código não é menção. Quem confirma é `mentionsWikiTitle` (domínio), sobre o conteúdo que
 * voltou. Backlink derivado do texto, sem tabela de índice para reconciliar a cada save, é decisão
 * explícita da 056.
 */
export async function fetchNotesMentioning(
  title: string,
  excludeNoteId?: string
): Promise<Note[]> {
  const target = title.trim();
  if (!target) return [];
  const userId = await getCurrentUserId();
  let query = supabase
    .from("note")
    .select("*")
    .eq("user_id", userId)
    // `%`, `_` e `\` são curingas do LIKE: um título com `%` traria o banco inteiro.
    .ilike("content", `%[[${escapeLikeValue(target)}]]%`);
  if (excludeNoteId) query = query.neq("id", excludeNoteId);
  const { data, error } = await query.order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

function escapeLikeValue(raw: string): string {
  return raw.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export async function deleteNote(id: string): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("note")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}
