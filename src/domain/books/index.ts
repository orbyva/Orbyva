import type { Book, BookRatingFloor, BookStatus } from "@/types/books";
import {
  datesTouchYear,
  isEntertainmentFavorite,
  pickRandomItem,
} from "@/domain/entertainment/insights";

export const BOOK_STATUS_LABELS: Record<BookStatus, string> = {
  to_read: "Para ler",
  reading: "Lendo",
  read: "Lido",
  abandoned: "Abandonei",
};

/** Google Books manda HTML na descrição — vira texto limpo. */
export function stripBookHtml(html: string): string {
  const withBreaks = html
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(div|h[1-6]|li|blockquote)>/gi, "\n")
    .replace(/<\/?(i|em|b|strong|u|span|a)[^>]*>/gi, "");
  if (typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(withBreaks, "text/html");
    return (doc.body.textContent || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
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

/** Categorias do Google Books costumam vir em inglês. */
const CATEGORY_PT: Record<string, string> = {
  fiction: "Ficção",
  "juvenile fiction": "Ficção juvenil",
  "young adult fiction": "Ficção young adult",
  "science fiction": "Ficção científica",
  fantasy: "Fantasia",
  mystery: "Mistério",
  "mystery & detective": "Mistério e detetive",
  suspense: "Suspense",
  thriller: "Thriller",
  romance: "Romance",
  horror: "Terror",
  adventure: "Aventura",
  historical: "Histórico",
  "historical fiction": "Ficção histórica",
  biography: "Biografia",
  autobiography: "Autobiografia",
  "biography & autobiography": "Biografia e autobiografia",
  religion: "Religião",
  christian: "Cristão",
  christianity: "Cristianismo",
  "christian life": "Vida cristã",
  "body, mind & spirit": "Corpo, mente e espírito",
  selfhelp: "Autoajuda",
  "self-help": "Autoajuda",
  "self help": "Autoajuda",
  psychology: "Psicologia",
  philosophy: "Filosofia",
  history: "História",
  science: "Ciência",
  business: "Negócios",
  economics: "Economia",
  "business & economics": "Negócios e economia",
  computers: "Computação",
  technology: "Tecnologia",
  "computers & technology": "Computação e tecnologia",
  cooking: "Culinária",
  travel: "Viagem",
  poetry: "Poesia",
  drama: "Drama",
  comics: "Quadrinhos",
  "comics & graphic novels": "HQs e graphic novels",
  "graphic novels": "Graphic novels",
  art: "Arte",
  music: "Música",
  sports: "Esportes",
  "sports & recreation": "Esportes e lazer",
  education: "Educação",
  family: "Família",
  "family & relationships": "Família e relacionamentos",
  health: "Saúde",
  "health & fitness": "Saúde e fitness",
  medical: "Medicina",
  law: "Direito",
  politics: "Política",
  "political science": "Ciência política",
  social: "Social",
  "social science": "Ciências sociais",
  nature: "Natureza",
  reference: "Referência",
  "literary criticism": "Crítica literária",
  "literary collections": "Coletâneas literárias",
  "true crime": "True crime",
  humor: "Humor",
  "humor & entertainment": "Humor e entretenimento",
  children: "Infantil",
  "juvenile nonfiction": "Não ficção juvenil",
  nonfiction: "Não ficção",
  general: "Geral",
};

function translateCategorySegment(segment: string): string {
  const key = segment.trim().toLowerCase();
  if (!key) return "";
  if (CATEGORY_PT[key]) return CATEGORY_PT[key];
  if (key.includes("/")) {
    return key
      .split("/")
      .map((part) => translateCategorySegment(part))
      .filter(Boolean)
      .join(" · ");
  }
  for (const [en, pt] of Object.entries(CATEGORY_PT)) {
    if (key === en || key.endsWith(` ${en}`) || key.startsWith(`${en} `)) {
      return pt;
    }
  }
  return segment
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export function translateBookCategories(categories: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of categories) {
    const translated = translateCategorySegment(raw);
    if (!translated || seen.has(translated)) continue;
    seen.add(translated);
    out.push(translated);
  }
  return out;
}

/** Limpa aspas/colchetes residuais de tokens mal serializados. */
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
        /* cai no split */
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
    categories: translateBookCategories(asStringList(raw.categories)),
    description,
    read_dates: Array.isArray(raw.read_dates)
      ? raw.read_dates.map((d) => String(d).slice(0, 10))
      : [],
    would_recommend: raw.would_recommend !== false,
  };
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

/** Badge do card: nota do usuário (lido) ou Google (para ler). Sem % — progresso é outra UI. */
export function getBookCardRating(book: Book): {
  value: string;
  source: "user" | "google";
} | null {
  if (book.status === "read" && book.rating != null && book.rating > 0) {
    return { value: formatBookRating(book.rating), source: "user" };
  }
  if (
    (book.status === "to_read" || book.status === "reading") &&
    book.score_google != null &&
    book.score_google > 0
  ) {
    return {
      value: formatBookRating(book.score_google * 2),
      source: "google",
    };
  }
  return null;
}

export function getDisplayBookScore(book: Book): string | number {
  const card = getBookCardRating(book);
  return card?.value ?? "—";
}

export function getLatestReadDate(dates: Book["read_dates"]): string | null {
  if (!dates?.length) return null;
  const sorted = [...dates].map((d) => String(d).slice(0, 10)).sort();
  return sorted[sorted.length - 1] ?? null;
}

export function collectBookCategories(books: Book[]): string[] {
  const set = new Set<string>();
  for (const b of books) {
    for (const c of b.categories ?? []) {
      if (c.trim()) set.add(c.trim());
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export function collectBookAuthors(books: Book[]): string[] {
  const set = new Set<string>();
  for (const b of books) {
    for (const a of b.authors ?? []) {
      if (a.trim()) set.add(a.trim());
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export function filterBooksByMeta(
  books: Book[],
  options: {
    category: string;
    author: string;
    minRating: BookRatingFloor;
  }
): Book[] {
  return books.filter((book) => {
    if (
      options.category !== "all" &&
      !(book.categories ?? []).includes(options.category)
    ) {
      return false;
    }
    if (
      options.author !== "all" &&
      !(book.authors ?? []).includes(options.author)
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

/** @deprecated use filterBooksByMeta */
export function filterBooksByCategoryAndRating(
  books: Book[],
  options: { category: string; minRating: BookRatingFloor }
): Book[] {
  return filterBooksByMeta(books, { ...options, author: "all" });
}

export function getReadBooksStats(books: Book[]): {
  avgRating: number | null;
  rated: number;
} {
  const rated = books.filter((b) => b.rating != null && b.rating > 0);
  if (rated.length === 0) return { avgRating: null, rated: 0 };
  const sum = rated.reduce((acc, b) => acc + (b.rating ?? 0), 0);
  return {
    avgRating: Math.round((sum / rated.length) * 10) / 10,
    rated: rated.length,
  };
}

export type BookLibraryStats = {
  read: number;
  toRead: number;
  reading: number;
  abandoned: number;
  pagesRead: number;
  favorites: number;
  thisYear: number;
  rated: number;
  avgRating: number | null;
};

/** Agrega a biblioteca completa (todas as abas). */
export function getBookLibraryStats(
  books: Book[],
  year = new Date().getFullYear()
): BookLibraryStats {
  const read = books.filter((b) => b.status === "read");
  const rated = read.filter((b) => b.rating != null && b.rating > 0);
  const avgRating =
    rated.length === 0
      ? null
      : Math.round(
          (rated.reduce((s, b) => s + (b.rating ?? 0), 0) / rated.length) * 10
        ) / 10;

  return {
    read: read.length,
    toRead: books.filter((b) => b.status === "to_read").length,
    reading: books.filter((b) => b.status === "reading").length,
    abandoned: books.filter((b) => b.status === "abandoned").length,
    pagesRead: read.reduce(
      (sum, b) => sum + (b.page_count != null && b.page_count > 0 ? b.page_count : 0),
      0
    ),
    favorites: read.filter((b) => isEntertainmentFavorite(b)).length,
    thisYear: read.filter((b) => datesTouchYear(b.read_dates, year)).length,
    rated: rated.length,
    avgRating,
  };
}

export function pickRandomBook(books: Book[]): Book | null {
  return pickRandomItem(books);
}

export function pickRandomToReadBook(books: Book[]): Book | null {
  return pickRandomItem(books.filter((b) => b.status === "to_read"));
}

export function formatAuthors(authors: string[]): string {
  if (!authors.length) return "Autor desconhecido";
  if (authors.length === 1) return authors[0];
  if (authors.length === 2) return `${authors[0]} e ${authors[1]}`;
  return `${authors[0]} e outros`;
}

/** Texto da marca-página, ou null se não houver. */
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

/** Progresso 0–100, ou null se não dá para calcular. */
export function getReadingProgress(book: {
  current_page?: number | null;
  page_count?: number | null;
}): number | null {
  const page = book.current_page;
  const total = book.page_count;
  if (page == null || page <= 0 || total == null || total <= 0) return null;
  return Math.min(100, Math.round((page / total) * 100));
}

/** Parseia input de página (vazio → null). */
export function parsePageInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return null;
  return n;
}
