import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth-user";
import { normalizeBook } from "@/domain/books";
import type {
  Book,
  BookCreateRequest,
  BookNote,
  BookNoteCreateRequest,
  BookStatus,
  BookUpdateRequest,
} from "@/types/books";

/** Campos persistidos na tabela `book` (ignora score_google e afins). */
function bookDbFields(
  book: Partial<BookCreateRequest> & { google_id?: string }
) {
  return {
    ...(book.google_id !== undefined ? { google_id: book.google_id } : {}),
    ...(book.title !== undefined ? { title: book.title } : {}),
    ...(book.authors !== undefined ? { authors: book.authors } : {}),
    ...(book.published_year !== undefined
      ? { published_year: book.published_year }
      : {}),
    ...(book.cover_url !== undefined ? { cover_url: book.cover_url } : {}),
    ...(book.categories !== undefined ? { categories: book.categories } : {}),
    ...(book.description !== undefined
      ? { description: book.description }
      : {}),
    ...(book.page_count !== undefined ? { page_count: book.page_count } : {}),
    ...(book.publisher !== undefined ? { publisher: book.publisher } : {}),
    ...(book.isbn13 !== undefined ? { isbn13: book.isbn13 } : {}),
    ...(book.status !== undefined ? { status: book.status } : {}),
    ...(book.current_page !== undefined
      ? { current_page: book.current_page }
      : {}),
    ...(book.score_google !== undefined
      ? { score_google: book.score_google }
      : {}),
    ...(book.rating !== undefined ? { rating: book.rating } : {}),
    ...(book.notes !== undefined ? { notes: book.notes } : {}),
    ...(book.would_recommend !== undefined
      ? { would_recommend: book.would_recommend }
      : {}),
    ...(book.read_dates !== undefined ? { read_dates: book.read_dates } : {}),
  };
}

export async function fetchBooks(
  status: BookStatus,
  page: number,
  pageSize: number
): Promise<{ data: Book[]; total: number }> {
  const userId = await getCurrentUserId();
  const orderCol =
    status === "read"
      ? "read_dates"
      : status === "reading"
        ? "current_page"
        : "published_year";

  const { data, error, count } = await supabase
    .from("book")
    .select("*", { count: "exact" })
    .eq("user_id", userId)
    .eq("status", status)
    .order(orderCol, {
      ascending: false,
      nullsFirst: false,
    })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (error) throw new Error(error.message);
  return {
    data: (data || []).map((row) => normalizeBook(row as Book)),
    total: count || 0,
  };
}

/** Lista completa do usuário — filtro/paginação no cliente. */
export async function fetchAllBooks(): Promise<Book[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("book")
    .select("*")
    .eq("user_id", userId);

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
    },
  ]);

  if (error) throw new Error(error.message);
}

export async function updateBook(
  updateData: BookUpdateRequest
): Promise<void> {
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
