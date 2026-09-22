import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth-user";
import { escapeLikeValue } from "@/lib/likePattern";
import { normalizeNoteDraft } from "@/domain/notes/noteDraft";
import { TASK_REF_SCHEME } from "@/domain/tasks/taskRefs";
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
 * Quantas notas este projeto tem — o número que a aba "Notas" da página do projeto mostra
 * (feature 069). `head: true` + `count: "exact"`: só a contagem, sem trazer linha nenhuma.
 */
export async function countNotesByProject(projectId: string): Promise<number> {
  const userId = await getCurrentUserId();
  const { count, error } = await supabase
    .from("note")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("project_id", projectId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

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

/**
 * Candidatas a "Referenciada em" de uma tarefa: notas cujo `content` traz a marca
 * `[Rótulo](orbyva-task:<id>)` (feature 106).
 *
 * Mesma divisão de trabalho de `fetchNotesMentioning`: o `ilike` é **prefiltro**, não veredito —
 * quem decide o que é menção de verdade é `mentionsTaskId` (domínio, feature 103), que descarta a
 * marca escrita dentro de bloco de código. Sem essa confirmação, uma nota que só mostra a sintaxe
 * num exemplo entraria como menção real.
 *
 * A diferença em relação à irmã: aqui a chave é o **id**, não o título. O prefiltro
 * `%orbyva-task:<uuid>%` é praticamente exato, e renomear a tarefa não derruba menção nenhuma.
 */
export async function fetchNotesMentioningTask(taskId: string): Promise<Note[]> {
  const target = taskId.trim();
  if (!target) return [];
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("note")
    .select("*")
    .eq("user_id", userId)
    // O id é uuid e não tem curinga, mas escapar é o que mantém isto correto no dia em que a marca
    // aceitar outra coisa — confiar no formato do id seria o atalho que envelhece mal.
    .ilike("content", `%${escapeLikeValue(`${TASK_REF_SCHEME}${target}`)}%`)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
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
