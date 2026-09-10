import { getCurrentUserId } from "@/lib/auth-user";
import { supabase } from "@/lib/supabase";
import { normalizeNoteTitle } from "@/domain/notes/listView";
import type { Note } from "@/types/notes";

const NOTE_SELECT = "id, title, content, kind, project_id, updated_at";

export async function fetchNotes(): Promise<Note[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("note")
    .select(NOTE_SELECT)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Note[];
}

export async function fetchNoteById(id: string): Promise<Note | null> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("note")
    .select(NOTE_SELECT)
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Note | null) ?? null;
}

export async function createNoteApi(input: {
  title: string;
  content: string;
  projectId?: string | null;
}): Promise<Note> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("note")
    .insert([
      {
        user_id: userId,
        title: normalizeNoteTitle(input.title),
        content: input.content,
        project_id: input.projectId ?? null,
        kind: "markdown",
        canvas_data: null,
      },
    ])
    .select(NOTE_SELECT)
    .single();
  if (error) throw new Error(error.message);
  return data as Note;
}

export async function updateNoteApi(input: {
  id: string;
  title: string;
  content: string;
  projectId?: string | null;
}): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("note")
    .update({
      title: normalizeNoteTitle(input.title),
      content: input.content,
      ...(input.projectId !== undefined ? { project_id: input.projectId } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function deleteNoteApi(id: string): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("note")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}
