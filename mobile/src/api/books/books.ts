import { getCurrentUserId } from "@/lib/auth-user";
import { supabase } from "@/lib/supabase";
import { normalizeBook } from "@/domain/books";
import { normalizeEntertainmentDates } from "@/domain/entertainment/insights";
import type { Book, BookCreateRequest, BookUpdateRequest } from "@/types/books";

function bookDbFields(book: Partial<BookCreateRequest> & { google_id?: string }) {
  return {
    ...(book.google_id !== undefined ? { google_id: book.google_id } : {}),
    ...(book.title !== undefined ? { title: book.title } : {}),
    ...(book.authors !== undefined ? { authors: book.authors } : {}),
    ...(book.published_year !== undefined ? { published_year: book.published_year } : {}),
    ...(book.cover_url !== undefined ? { cover_url: book.cover_url } : {}),
    ...(book.categories !== undefined ? { categories: book.categories } : {}),
    ...(book.description !== undefined ? { description: book.description } : {}),
    ...(book.page_count !== undefined ? { page_count: book.page_count } : {}),
    ...(book.publisher !== undefined ? { publisher: book.publisher } : {}),
    ...(book.isbn13 !== undefined ? { isbn13: book.isbn13 } : {}),
    ...(book.status !== undefined ? { status: book.status } : {}),
    ...(book.current_page !== undefined ? { current_page: book.current_page } : {}),
    ...(book.score_google !== undefined ? { score_google: book.score_google } : {}),
    ...(book.rating !== undefined ? { rating: book.rating } : {}),
    ...(book.notes !== undefined ? { notes: book.notes } : {}),
    ...(book.would_recommend !== undefined ? { would_recommend: book.would_recommend } : {}),
    ...(book.is_favorite !== undefined ? { is_favorite: book.is_favorite } : {}),
    ...(book.read_dates !== undefined
      ? { read_dates: normalizeEntertainmentDates(book.read_dates) }
      : {}),
  };
}

export async function fetchAllBooks(): Promise<Book[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase.from("book").select("*").eq("user_id", userId);
  if (error) throw new Error(error.message);
  return (data || []).map((row) => normalizeBook(row as Book));
}

export async function fetchBookById(googleId: string): Promise<Book | null> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("book")
    .select("*")
    .eq("user_id", userId)
    .eq("google_id", googleId)
    .maybeSingle();
  if (error) return null;
  return data ? normalizeBook(data as Book) : null;
}

export async function createBook(book: BookCreateRequest): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase.from("book").insert([
    {
      ...bookDbFields(book),
      user_id: userId,
      notes: book.notes ?? null,
      would_recommend: book.would_recommend ?? true,
      is_favorite: book.is_favorite === true,
    },
  ]);
  if (error) throw new Error(error.message);
}

export async function updateBook(updateData: BookUpdateRequest): Promise<void> {
  const userId = await getCurrentUserId();
  const { google_id, ...rest } = updateData;
  const { error } = await supabase
    .from("book")
    .update(bookDbFields(rest))
    .eq("user_id", userId)
    .eq("google_id", google_id);
  if (error) throw new Error(error.message);
}

export async function deleteBook(googleId: string): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("book")
    .delete()
    .eq("user_id", userId)
    .eq("google_id", googleId);
  if (error) throw new Error(error.message);
}
