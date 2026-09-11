import { getCurrentUserId } from "@/lib/auth-user";
import { supabase } from "@/lib/supabase";
import type { NoteLink, NoteLinkDraft } from "@/types/notes";

export async function fetchLinksForNote(noteId: string): Promise<NoteLink[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("note_link")
    .select("id, note_id, entity_type, entity_id, label")
    .eq("user_id", userId)
    .eq("note_id", noteId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as NoteLink[];
}

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
    .select("id, note_id, entity_type, entity_id, label")
    .single();
  if (error) throw new Error(error.message);
  return data as NoteLink;
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
