import { getCurrentUserId } from "@/lib/auth-user";
import { supabase } from "@/lib/supabase";
import type { BookNote, BookNoteCreateRequest } from "@/types/books";

export async function fetchBookNotes(googleId: string): Promise<BookNote[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("book_note")
    .select("*")
    .eq("user_id", userId)
    .eq("google_id", googleId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as BookNote[];
}

export async function createBookNote(
  note: BookNoteCreateRequest
): Promise<BookNote> {
  const userId = await getCurrentUserId();
  const body = note.body.trim();
  if (!body) throw new Error("Escreva um comentário.");
  const { data, error } = await supabase
    .from("book_note")
    .insert([
      {
        user_id: userId,
        google_id: note.google_id,
        page: note.page ?? null,
        body,
      },
    ])
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as BookNote;
}

export async function deleteBookNote(id: string): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("book_note")
    .delete()
    .eq("user_id", userId)
    .eq("id", id);
  if (error) throw new Error(error.message);
}
