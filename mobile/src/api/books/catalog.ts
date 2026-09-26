import { stripBookHtml } from "@/domain/books";
import { googleBooksApiKey } from "@/lib/env";
import type { Book } from "@/types/books";

const API = "https://www.googleapis.com/books/v1/volumes";

export type BookSearchHit = {
  google_id: string;
  title: string;
  authors: string[];
  published_year: number | null;
  cover_url: string | null;
};

function httpsCover(url?: string | null): string | null {
  if (!url) return null;
  return url.replace(/^http:\/\//i, "https://");
}

function yearFromDate(publishedDate?: string): number | null {
  if (!publishedDate) return null;
  const y = Number(publishedDate.slice(0, 4));
  return Number.isFinite(y) && y > 0 ? y : null;
}

type GoogleVolume = {
  id: string;
  volumeInfo?: {
    title?: string;
    authors?: string[];
    publishedDate?: string;
    description?: string;
    pageCount?: number;
    categories?: string[];
    publisher?: string;
    averageRating?: number;
    imageLinks?: { thumbnail?: string; smallThumbnail?: string; medium?: string };
    industryIdentifiers?: { type?: string; identifier?: string }[];
  };
};

function withKey(url: URL): URL {
  if (googleBooksApiKey) url.searchParams.set("key", googleBooksApiKey);
  return url;
}

export async function searchBookCatalog(query: string): Promise<BookSearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  const url = withKey(new URL(API));
  url.searchParams.set("q", `intitle:${q}`);
  url.searchParams.set("maxResults", "12");
  url.searchParams.set("printType", "books");
  url.searchParams.set("langRestrict", "pt");
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("Não foi possível consultar o catálogo de livros.");
  const data = (await res.json()) as { items?: GoogleVolume[] };
  return (data.items ?? [])
    .map((volume) => {
      const info = volume.volumeInfo;
      if (!volume.id || !info?.title?.trim()) return null;
      return {
        google_id: volume.id,
        title: info.title.trim(),
        authors: info.authors ?? [],
        published_year: yearFromDate(info.publishedDate),
        cover_url: httpsCover(
          info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail ?? null
        ),
      };
    })
    .filter((hit): hit is BookSearchHit => Boolean(hit));
}

export async function fetchBookCatalogDetails(googleId: string): Promise<Book | null> {
  const url = withKey(new URL(`${API}/${encodeURIComponent(googleId)}`));
  const res = await fetch(url.toString());
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Não foi possível abrir o livro do catálogo.");
  const volume = (await res.json()) as GoogleVolume;
  const info = volume.volumeInfo;
  if (!volume.id || !info?.title?.trim()) return null;
  const isbn =
    info.industryIdentifiers?.find((i) => i.type === "ISBN_13")?.identifier ??
    info.industryIdentifiers?.find((i) => i.type === "ISBN_10")?.identifier ??
    null;
  return {
    google_id: volume.id,
    title: info.title.trim(),
    authors: info.authors ?? [],
    published_year: yearFromDate(info.publishedDate),
    cover_url: httpsCover(
      info.imageLinks?.medium ??
        info.imageLinks?.thumbnail ??
        info.imageLinks?.smallThumbnail ??
        null
    ),
    categories: info.categories ?? [],
    description: info.description ? stripBookHtml(info.description) : null,
    page_count: info.pageCount ?? null,
    publisher: info.publisher ?? null,
    isbn13: isbn,
    status: "to_read",
    current_page: null,
    rating: null,
    notes: null,
    would_recommend: true,
    read_dates: [],
    score_google: info.averageRating ?? null,
  };
}
