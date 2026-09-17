import { getCurrentUserId } from "@/lib/auth-user";
import { supabase } from "@/lib/supabase";
import {
  canMoveFolder,
  canNestUnder,
  reparentChildren,
} from "@/domain/notes/folders";
import type {
  NoteFolder,
  NoteFolderDraft,
  NoteFolderUpdateRequest,
} from "@/types/notes";

const FOLDER_SELECT = "id, name, parent_id, project_id, tag_id";

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
    .select(FOLDER_SELECT)
    .eq("user_id", userId)
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as NoteFolder[];
}

export async function createNoteFolderApi(
  draft: NoteFolderDraft
): Promise<NoteFolder> {
  const userId = await getCurrentUserId();
  const payload = normalizeFolderDraft(draft);
  const folders = await fetchNoteFolders();
  if (!canNestUnder(folders, payload.parent_id)) {
    throw new Error("A pasta não pode ter mais de 3 níveis.");
  }
  const { data, error } = await supabase
    .from("note_folder")
    .insert([{ ...payload, user_id: userId }])
    .select(FOLDER_SELECT)
    .single();
  if (error) throw new Error(error.message);
  return data as NoteFolder;
}

export async function updateNoteFolderApi(
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
      throw new Error("Essa mudança deixaria a pasta com mais de 3 níveis.");
    }
  }

  const { error } = await supabase
    .from("note_folder")
    .update(patch)
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function deleteNoteFolderApi(id: string): Promise<void> {
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
