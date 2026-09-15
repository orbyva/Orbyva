import { getCurrentUserId } from "@/lib/auth-user";
import { supabase } from "@/lib/supabase";
import { normalizeNoteTitle } from "@/domain/notes/listView";
import type { Note, NoteCanvasData, NoteKind } from "@/types/notes";

const NOTE_SELECT = "id, title, content, kind, canvas_data, project_id, updated_at";

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
  content?: string;
  projectId?: string | null;
  kind?: NoteKind;
  canvasData?: NoteCanvasData | null;
}): Promise<Note> {
  const userId = await getCurrentUserId();
  const kind = input.kind ?? "markdown";
  const { data, error } = await supabase
    .from("note")
    .insert([
      {
        user_id: userId,
        title: normalizeNoteTitle(input.title),
        content: kind === "canvas" ? "" : (input.content ?? ""),
        project_id: input.projectId ?? null,
        kind,
        canvas_data: kind === "canvas" ? (input.canvasData ?? { elements: [] }) : null,
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
  content?: string;
  projectId?: string | null;
  canvasData?: NoteCanvasData | null;
}): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("note")
    .update({
      title: normalizeNoteTitle(input.title),
      ...(input.content !== undefined ? { content: input.content } : {}),
      ...(input.projectId !== undefined ? { project_id: input.projectId } : {}),
      ...(input.canvasData !== undefined ? { canvas_data: input.canvasData } : {}),
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
