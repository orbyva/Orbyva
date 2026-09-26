import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth-user";
import {
  canMoveFolder,
  canNestUnder,
  folderDepthLimitMessage,
  reparentChildren,
} from "@/domain/notes/folders";
import type {
  NoteFolder,
  NoteFolderDraft,
  NoteFolderUpdateRequest,
} from "@/types/notes";

function normalizeFolderDraft(draft: NoteFolderDraft): NoteFolderDraft {
  const name = draft.name.trim();
  if (!name) throw new Error("A pasta precisa de um nome.");
  return {
    name,
    parent_id: draft.parent_id ? draft.parent_id : null,
    project_id: draft.project_id ? draft.project_id : null,
    tag_id: draft.tag_id ? draft.tag_id : null,
  };
}

export async function fetchNoteFolders(): Promise<NoteFolder[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("note_folder")
    .select("*")
    .eq("user_id", userId)
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createNoteFolder(
  draft: NoteFolderDraft
): Promise<NoteFolder> {
  const userId = await getCurrentUserId();
  const payload = normalizeFolderDraft(draft);
  const folders = await fetchNoteFolders();
  if (!canNestUnder(folders, payload.parent_id)) {
    throw new Error(folderDepthLimitMessage("create"));
  }
  const { data, error } = await supabase
    .from("note_folder")
    .insert([{ ...payload, user_id: userId }])
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateNoteFolder(
  request: NoteFolderUpdateRequest
): Promise<void> {
  const userId = await getCurrentUserId();
  const { id, ...fields } = request;
  const patch: Record<string, unknown> = { ...fields };
  if (fields.name !== undefined) {
    const name = fields.name.trim();
    if (!name) throw new Error("A pasta precisa de um nome.");
    patch.name = name;
  }
  if (fields.parent_id !== undefined) {
    patch.parent_id = fields.parent_id ? fields.parent_id : null;
  }
  if (fields.project_id !== undefined) {
    patch.project_id = fields.project_id ? fields.project_id : null;
  }
  if (fields.tag_id !== undefined) {
    patch.tag_id = fields.tag_id ? fields.tag_id : null;
  }

  if (fields.parent_id !== undefined) {
    const folders = await fetchNoteFolders();
    const nextParent = fields.parent_id ? fields.parent_id : null;
    if (!canMoveFolder(folders, id, nextParent)) {
      throw new Error(folderDepthLimitMessage("move"));
    }
  }

  const { error } = await supabase
    .from("note_folder")
    .update(patch)
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/**
 * Reparenta os filhos para o pai desta pasta **antes** do delete — a UI nunca dispara o
 * `on delete cascade` do `parent_id`. As notas caem em "Sem pasta" pelo `on delete set null`
 * de `note.folder_id`.
 */
export async function deleteNoteFolder(id: string): Promise<void> {
  const userId = await getCurrentUserId();
  const folders = await fetchNoteFolders();
  const patch = reparentChildren(folders, id);
  for (const [childId, parentId] of Object.entries(patch)) {
    const { error } = await supabase
      .from("note_folder")
      .update({ parent_id: parentId })
      .eq("id", childId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
  }
  const { error } = await supabase
    .from("note_folder")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}
