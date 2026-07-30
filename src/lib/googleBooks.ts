/**
 * Google Books API — busca e detalhes de volumes.
 * Docs: https://developers.google.com/books/docs/v1/using
 */
import type { Book } from "@/types/books";
import {
  stripBookHtml,
  translateBookCategories,
} from "@/domain/books";

const API = "https://www.googleapis.com/books/v1/volumes";

export type BookSearchHit = {
  google_id: string;
  title: string;
  authors: string[];
  published_year: number | null;
  cover_url: string | null;
  description?: string | null;
};

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
    language?: string;
    averageRating?: number;
    imageLinks?: {
      thumbnail?: string;
      smallThumbnail?: string;
      small?: string;
      medium?: string;
    };
    industryIdentifiers?: { type?: string; identifier?: string }[];
  };
};

export function isGoogleBooksConfigured(): boolean {
  return Boolean(import.meta.env.VITE_GOOGLE_BOOKS_API_KEY?.trim());
}

function apiKey(): string {
  const key = import.meta.env.VITE_GOOGLE_BOOKS_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "Catálogo de livros temporariamente indisponível."
    );
  }
  return key;
}

async function googleBooksError(res: Response): Promise<Error> {
  try {
    const body = (await res.json()) as {
      error?: { message?: string; status?: string; details?: { reason?: string }[] };
    };
    const reason = body.error?.details?.[0]?.reason ?? body.error?.status;
    const message = body.error?.message;
    if (reason === "API_KEY_HTTP_REFERRER_BLOCKED" || message?.includes("referer")) {
      console.error("[googleBooks] API key referrer blocked", { reason, message });
      return new Error(
        "Catálogo de livros temporariamente indisponível. Tente mais tarde."
      );
    }
  } catch {
    /* ignore */
  }
  if (res.status === 429) {
    return new Error("Muitas buscas em pouco tempo. Aguarde um momento e tente de novo.");
  }
  return new Error("Não foi possível consultar o catálogo de livros.");
}

function httpsCover(url?: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.replace(/^http:\/\//i, "https://"));
    if (u.searchParams.has("zoom")) u.searchParams.set("zoom", "2");
    u.searchParams.delete("edge");
    return u.toString();
  } catch {
    return url.replace(/^http:\/\//i, "https://").replace(/zoom=\d+/, "zoom=2");
  }
}

function yearFromDate(publishedDate?: string): number | null {
  if (!publishedDate) return null;
  const y = Number(publishedDate.slice(0, 4));
  return Number.isFinite(y) && y > 0 ? y : null;
}

function isbn13From(volume: GoogleVolume): string | null {
  const ids = volume.volumeInfo?.industryIdentifiers ?? [];
  const isbn13 = ids.find((i) => i.type === "ISBN_13")?.identifier;
  if (isbn13) return isbn13;
  return ids.find((i) => i.type === "ISBN_10")?.identifier ?? null;
}

function bookFromVolume(volume: GoogleVolume): Book | null {
  const info = volume.volumeInfo;
  if (!volume.id || !info?.title?.trim()) return null;
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
    categories: translateBookCategories(info.categories ?? []),
    description: info.description ? stripBookHtml(info.description) : null,
    page_count: info.pageCount ?? null,
    publisher: info.publisher ?? null,
    isbn13: isbn13From(volume),
    status: "to_read",
    current_page: null,
    rating: null,
    notes: null,
    would_recommend: true,
    read_dates: [],
    score_google: info.averageRating ?? null,
  };
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** ISBN-10 / ISBN-13 (com ou sem hífens). */
function parseIsbn(query: string): string | null {
  const digits = query.replace(/[-\s]/g, "");
  if (/^\d{13}$/.test(digits) && /^(978|979)/.test(digits)) return digits;
  if (/^\d{9}[\dXx]$/.test(digits)) return digits.toUpperCase();
  return null;
}

type RankedHit = BookSearchHit & { language?: string | null };

function hitFromVolume(volume: GoogleVolume): RankedHit | null {
  const info = volume.volumeInfo;
  if (!volume.id || !info?.title?.trim()) return null;
  return {
    google_id: volume.id,
    title: info.title.trim(),
    authors: info.authors ?? [],
    published_year: yearFromDate(info.publishedDate),
    cover_url: httpsCover(
      info.imageLinks?.thumbnail ??
        info.imageLinks?.smallThumbnail ??
        info.imageLinks?.small ??
        null
    ),
    description: info.description ? stripBookHtml(info.description) : null,
    language: info.language ?? null,
  };
}

function scoreHit(hit: RankedHit, queryNorm: string): number {
  const titleNorm = normalizeText(hit.title);
  const authorsNorm = normalizeText(hit.authors.join(" "));
  const words = queryNorm.split(" ").filter((w) => w.length > 1);

  let score = 0;

  if (titleNorm === queryNorm) score += 120;
  else if (titleNorm.startsWith(queryNorm)) score += 90;
  else if (titleNorm.includes(queryNorm)) score += 70;

  if (words.length > 0) {
    const titleHits = words.filter((w) => titleNorm.includes(w)).length;
    const authorHits = words.filter((w) => authorsNorm.includes(w)).length;
    score += (titleHits / words.length) * 40;
    score += (authorHits / words.length) * 55;
  }

  if (authorsNorm.includes(queryNorm)) score += 50;
  if (hit.authors.length > 0) score += 8;
  if (hit.cover_url) score += 6;
  if (hit.language === "pt" || hit.language === "pt-BR") score += 12;
  if (!hit.authors.length && !hit.cover_url) score -= 25;

  return score;
}

function mergeAndRank(hits: RankedHit[], query: string): BookSearchHit[] {
  const queryNorm = normalizeText(query);
  const byId = new Map<string, RankedHit>();
  for (const hit of hits) {
    if (!byId.has(hit.google_id)) byId.set(hit.google_id, hit);
  }

  return [...byId.values()]
    .map((hit) => ({ hit, score: scoreHit(hit, queryNorm) }))
    .filter(({ score }) => score >= 20)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map(({ hit }) => {
      const { language: _lang, ...rest } = hit;
      void _lang;
      return rest;
    });
}

async function fetchVolumeHits(q: string): Promise<RankedHit[]> {
  const url = new URL(API);
  url.searchParams.set("q", q);
  url.searchParams.set("maxResults", "20");
  url.searchParams.set("printType", "books");
  url.searchParams.set("orderBy", "relevance");
  url.searchParams.set("key", apiKey());

  const res = await fetch(url.toString());
  if (!res.ok) throw await googleBooksError(res);
  const data = (await res.json()) as { items?: GoogleVolume[] };
  return (data.items ?? [])
    .map(hitFromVolume)
    .filter((h): h is RankedHit => Boolean(h));
}

/**
 * Busca por ISBN, título ou autor.
 * Combina frase + intitle + inauthor e ranqueia no cliente —
 * a query solta do Google Books é péssima para títulos curtos/comuns.
 */
export async function searchGoogleBooks(
  query: string
): Promise<BookSearchHit[]> {
  const q = query.trim();
  if (!q) return [];

  const isbn = parseIsbn(q);
  if (isbn) {
    return mergeAndRank(await fetchVolumeHits(`isbn:${isbn}`), q);
  }

  const queries = [`"${q}"`, `intitle:${q}`, `inauthor:${q}`];
  const batches = await Promise.all(
    queries.map((part) => fetchVolumeHits(part).catch(() => [] as RankedHit[]))
  );
  const merged = mergeAndRank(batches.flat(), q);
  if (merged.length > 0) return merged;

  // Último recurso: query livre (sem rank mínimo)
  const loose = await fetchVolumeHits(q);
  const byId = new Map<string, RankedHit>();
  for (const hit of loose) byId.set(hit.google_id, hit);
  return [...byId.values()].slice(0, 20).map(({ language: _l, ...rest }) => {
    void _l;
    return rest;
  });
}

export async function fetchGoogleBookById(
  googleId: string
): Promise<Book | null> {
  const id = googleId.trim();
  if (!id) return null;

  const url = new URL(`${API}/${encodeURIComponent(id)}`);
  url.searchParams.set("key", apiKey());

  const res = await fetch(url.toString());
  if (res.status === 404) return null;
  if (!res.ok) throw await googleBooksError(res);
  const volume = (await res.json()) as GoogleVolume;
  return bookFromVolume(volume);
}
