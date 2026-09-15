import type { Book, BookRatingFloor, BookStatus } from "@/types/books";
import {
  activityTouchesYear,
  appendActivityDate,
  isEntertainmentFavorite,
  normalizeEntertainmentDates,
  pickRandomItem,
} from "@/domain/entertainment/insights";

export const BOOK_STATUS_LABELS: Record<BookStatus, string> = {
  to_read: "Para ler",
  reading: "Lendo",
  read: "Lido",
  abandoned: "Abandonei",
};

export function stripBookHtml(html: string): string {
  const withBreaks = html
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(div|h[1-6]|li|blockquote)>/gi, "\n")
    .replace(/<\/?(i|em|b|strong|u|span|a)[^>]*>/gi, "");
  return withBreaks
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanListToken(value: string): string {
  return value
    .trim()
    .replace(/^\[+/, "")
    .replace(/\]+$/, "")
    .replace(/^["'\u201C\u201D]+|["'\u201C\u201D]+$/g, "")
    .trim();
}

export function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) =>
        typeof item === "string" || typeof item === "number"
          ? [cleanListToken(String(item))]
          : asStringList(item)
      )
      .filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    const trimmed = value.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return asStringList(parsed);
      } catch {
        /* split */
      }
    }
    return trimmed.split(",").map(cleanListToken).filter(Boolean);
  }
  return [];
}

export function normalizeBook(raw: Book): Book {
  const description = raw.description?.trim()
    ? stripBookHtml(raw.description)
    : raw.description ?? null;
  return {
    ...raw,
    authors: asStringList(raw.authors),
    categories: asStringList(raw.categories),
    description,
    read_dates: normalizeEntertainmentDates(raw.read_dates),
    would_recommend: raw.would_recommend !== false,
    is_favorite: raw.is_favorite === true,
  };
}

export function formatAuthors(authors: string[]): string {
  if (!authors.length) return "Autor desconhecido";
  if (authors.length === 1) return authors[0];
  if (authors.length === 2) return `${authors[0]} e ${authors[1]}`;
  return `${authors[0]} e outros`;
}

export function formatBookmark(book: {
  current_page?: number | null;
  page_count?: number | null;
}): string | null {
  const page = book.current_page;
  if (page == null || page <= 0) return null;
  if (book.page_count != null && book.page_count > 0) {
    return `Pág. ${page} de ${book.page_count}`;
  }
  return `Pág. ${page}`;
}

export function getLatestReadDate(dates: Book["read_dates"]): string | null {
  if (!dates?.length) return null;
  const sorted = [...dates].map((d) => String(d).slice(0, 10)).sort();
  return sorted[sorted.length - 1] ?? null;
}

export function newManualBookId(): string {
  const id =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `manual_${id}`;
}

export function bookStatusUpdate(
  book: Book,
  status: BookStatus,
  todayIso: string
): { google_id: string; status: BookStatus; read_dates: string[] } {
  const dates = normalizeEntertainmentDates(book.read_dates);
  return {
    google_id: book.google_id,
    status,
    read_dates: status === "read" ? appendActivityDate(dates, todayIso) : dates,
  };
}

export function collectBookCategories(books: Book[]): string[] {
  const set = new Set<string>();
  for (const book of books) {
    for (const category of book.categories ?? []) {
      if (category.trim()) set.add(category.trim());
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export function filterBooksByMeta(
  books: Book[],
  options: { category: string; minRating: BookRatingFloor }
): Book[] {
  return books.filter((book) => {
    if (
      options.category !== "all" &&
      !(book.categories ?? []).includes(options.category)
    ) {
      return false;
    }
    if (options.minRating !== "all") {
      const min = Number(options.minRating);
      if ((book.rating ?? 0) < min) return false;
    }
    return true;
  });
}

export type BookLibraryStats = {
  read: number;
  toRead: number;
  reading: number;
  pagesRead: number;
  thisYear: number;
  favorites: number;
};

export function getBookLibraryStats(
  books: Book[],
  year = new Date().getFullYear()
): BookLibraryStats {
  const read = books.filter((book) => book.status === "read");
  return {
    read: read.length,
    toRead: books.filter((book) => book.status === "to_read").length,
    reading: books.filter((book) => book.status === "reading").length,
    pagesRead: read.reduce(
      (sum, book) =>
        sum + (book.page_count != null && book.page_count > 0 ? book.page_count : 0),
      0
    ),
    thisYear: read.filter((book) =>
      activityTouchesYear(book.read_dates, year, book.created_at)
    ).length,
    favorites: read.filter((book) => isEntertainmentFavorite(book)).length,
  };
}

export function pickRandomToReadBook(books: Book[]): Book | null {
  return pickRandomItem(books.filter((book) => book.status === "to_read"));
}

export function formatBookRating(rating: number): string {
  return Number.isInteger(rating)
    ? String(rating)
    : rating.toFixed(1).replace(".", ",");
}

export function getBookRatingLabel(rating: number): string {
  if (rating >= 9) return "Obra-prima";
  if (rating >= 8) return "Excelente";
  if (rating >= 7) return "Muito bom";
  if (rating >= 6) return "Bom";
  if (rating >= 4) return "Regular";
  if (rating >= 2) return "Fraco";
  return "Ruim";
}
