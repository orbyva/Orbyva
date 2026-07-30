import type { Movie, MovieListFilter } from "@/types/movies";
import { MovieStatus } from "@/types/movies";
import type { Book, BookStatus } from "@/types/books";
import type { Album, AlbumStatus } from "@/types/music";
import { getLatestWatchedDate } from "@/domain/movies";
import { getLatestReadDate } from "@/domain/books";
import { getLatestListenedDate } from "@/domain/music";

export type CatalogSort =
  | "default"
  | "title_asc"
  | "title_desc"
  | "year_desc"
  | "year_asc"
  | "rating_desc"
  | "rating_asc"
  | "activity_desc";

export const CATALOG_SORT_OPTIONS: { value: CatalogSort; label: string }[] = [
  { value: "default", label: "Ordenar" },
  { value: "title_asc", label: "Título A–Z" },
  { value: "title_desc", label: "Título Z–A" },
  { value: "year_desc", label: "Ano (mais novo)" },
  { value: "year_asc", label: "Ano (mais antigo)" },
  { value: "rating_desc", label: "Nota (maior)" },
  { value: "rating_asc", label: "Nota (menor)" },
  { value: "activity_desc", label: "Atividade recente" },
];

function compareTitle(a: string, b: string, dir: 1 | -1): number {
  return a.localeCompare(b, "pt-BR", { sensitivity: "base" }) * dir;
}

function compareYear(
  a: number | null | undefined,
  b: number | null | undefined,
  dir: 1 | -1
): number {
  const ya = a ?? (dir === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY);
  const yb = b ?? (dir === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY);
  if (ya === yb) return 0;
  return ya < yb ? -dir : dir;
}

/** Sem nota fica por último em ambas as direções. */
function compareRating(
  a: number | null | undefined,
  b: number | null | undefined,
  dir: 1 | -1
): number {
  const na = a == null ? null : Number(a);
  const nb = b == null ? null : Number(b);
  const aMissing = na == null || Number.isNaN(na) || na <= 0;
  const bMissing = nb == null || Number.isNaN(nb) || nb <= 0;
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  if (na === nb) return 0;
  return (na! < nb! ? -1 : 1) * dir;
}

/** Nota usada na ordenação = mesma regra do badge do card. */
function sortableMovieRating(movie: Movie): number | null {
  if (movie.status === MovieStatus.WATCHED) {
    const r = movie.rating == null ? null : Number(movie.rating);
    return r != null && !Number.isNaN(r) && r > 0 ? r : null;
  }
  const imdb = movie.score_imdb == null ? null : Number(movie.score_imdb);
  return imdb != null && !Number.isNaN(imdb) && imdb > 0 ? imdb : null;
}

function sortableBookRating(book: Book): number | null {
  if (book.status === "read") {
    const r = book.rating == null ? null : Number(book.rating);
    return r != null && !Number.isNaN(r) && r > 0 ? r : null;
  }
  const g = book.score_google == null ? null : Number(book.score_google);
  return g != null && !Number.isNaN(g) && g > 0 ? g * 2 : null;
}

function sortableAlbumRating(album: Album): number | null {
  const r = album.rating == null ? null : Number(album.rating);
  return r != null && !Number.isNaN(r) && r > 0 ? r : null;
}

function compareActivityDate(
  a: string | null | undefined,
  b: string | null | undefined,
  createdA?: string | null,
  createdB?: string | null
): number {
  const da = (a && a.slice(0, 10)) || (createdA ? String(createdA).slice(0, 10) : "");
  const db = (b && b.slice(0, 10)) || (createdB ? String(createdB).slice(0, 10) : "");
  if (!da && !db) return 0;
  if (!da) return 1;
  if (!db) return -1;
  return db.localeCompare(da);
}

export function sortMoviesForStatus(
  list: Movie[],
  status: MovieListFilter
): Movie[] {
  const copy = [...list];
  if (status === MovieStatus.WATCHED) {
    copy.sort((a, b) => {
      const da = getLatestWatchedDate(a.watched_dates) ?? "";
      const db = getLatestWatchedDate(b.watched_dates) ?? "";
      return db.localeCompare(da);
    });
  } else {
    copy.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  }
  return copy;
}

export function sortBooksForStatus(list: Book[], status: BookStatus): Book[] {
  const copy = [...list];
  if (status === "read") {
    copy.sort((a, b) => {
      const da = getLatestReadDate(a.read_dates) ?? "";
      const db = getLatestReadDate(b.read_dates) ?? "";
      return db.localeCompare(da);
    });
  } else if (status === "reading") {
    copy.sort((a, b) => (b.current_page ?? 0) - (a.current_page ?? 0));
  } else {
    copy.sort((a, b) => (b.published_year ?? 0) - (a.published_year ?? 0));
  }
  return copy;
}

export function sortAlbumsForStatus(
  list: Album[],
  status: AlbumStatus
): Album[] {
  const copy = [...list];
  if (status === "listened") {
    copy.sort((a, b) => {
      const da = getLatestListenedDate(a.listened_dates) ?? "";
      const db = getLatestListenedDate(b.listened_dates) ?? "";
      return db.localeCompare(da);
    });
  } else {
    copy.sort((a, b) => (b.release_year ?? 0) - (a.release_year ?? 0));
  }
  return copy;
}

export function sortMovies(
  list: Movie[],
  sort: CatalogSort,
  status: MovieListFilter
): Movie[] {
  if (sort === "default") return sortMoviesForStatus(list, status);
  const copy = [...list];
  switch (sort) {
    case "title_asc":
      copy.sort((a, b) => compareTitle(a.title, b.title, 1));
      break;
    case "title_desc":
      copy.sort((a, b) => compareTitle(a.title, b.title, -1));
      break;
    case "year_desc":
      copy.sort((a, b) => compareYear(a.year, b.year, -1));
      break;
    case "year_asc":
      copy.sort((a, b) => compareYear(a.year, b.year, 1));
      break;
    case "rating_desc":
      copy.sort((a, b) =>
        compareRating(sortableMovieRating(a), sortableMovieRating(b), -1)
      );
      break;
    case "rating_asc":
      copy.sort((a, b) =>
        compareRating(sortableMovieRating(a), sortableMovieRating(b), 1)
      );
      break;
    case "activity_desc":
      copy.sort((a, b) =>
        compareActivityDate(
          getLatestWatchedDate(a.watched_dates),
          getLatestWatchedDate(b.watched_dates),
          a.created_at,
          b.created_at
        )
      );
      break;
  }
  return copy;
}

export function sortBooks(
  list: Book[],
  sort: CatalogSort,
  status: BookStatus
): Book[] {
  if (sort === "default") return sortBooksForStatus(list, status);
  const copy = [...list];
  switch (sort) {
    case "title_asc":
      copy.sort((a, b) => compareTitle(a.title, b.title, 1));
      break;
    case "title_desc":
      copy.sort((a, b) => compareTitle(a.title, b.title, -1));
      break;
    case "year_desc":
      copy.sort((a, b) => compareYear(a.published_year, b.published_year, -1));
      break;
    case "year_asc":
      copy.sort((a, b) => compareYear(a.published_year, b.published_year, 1));
      break;
    case "rating_desc":
      copy.sort((a, b) =>
        compareRating(sortableBookRating(a), sortableBookRating(b), -1)
      );
      break;
    case "rating_asc":
      copy.sort((a, b) =>
        compareRating(sortableBookRating(a), sortableBookRating(b), 1)
      );
      break;
    case "activity_desc":
      copy.sort((a, b) =>
        compareActivityDate(
          getLatestReadDate(a.read_dates),
          getLatestReadDate(b.read_dates),
          a.created_at,
          b.created_at
        )
      );
      break;
  }
  return copy;
}

export function sortAlbums(
  list: Album[],
  sort: CatalogSort,
  status: AlbumStatus
): Album[] {
  if (sort === "default") return sortAlbumsForStatus(list, status);
  const copy = [...list];
  switch (sort) {
    case "title_asc":
      copy.sort((a, b) => compareTitle(a.title, b.title, 1));
      break;
    case "title_desc":
      copy.sort((a, b) => compareTitle(a.title, b.title, -1));
      break;
    case "year_desc":
      copy.sort((a, b) => compareYear(a.release_year, b.release_year, -1));
      break;
    case "year_asc":
      copy.sort((a, b) => compareYear(a.release_year, b.release_year, 1));
      break;
    case "rating_desc":
      copy.sort((a, b) =>
        compareRating(sortableAlbumRating(a), sortableAlbumRating(b), -1)
      );
      break;
    case "rating_asc":
      copy.sort((a, b) =>
        compareRating(sortableAlbumRating(a), sortableAlbumRating(b), 1)
      );
      break;
    case "activity_desc":
      copy.sort((a, b) =>
        compareActivityDate(
          getLatestListenedDate(a.listened_dates),
          getLatestListenedDate(b.listened_dates),
          a.created_at,
          b.created_at
        )
      );
      break;
  }
  return copy;
}
