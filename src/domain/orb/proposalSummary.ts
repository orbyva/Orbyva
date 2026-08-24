import type { MovieStatus } from "@/types/movies";
import type { BookStatus } from "@/types/books";
import type { AlbumStatus } from "@/types/music";
import type {
  OrbAlbumPayload,
  OrbBookPayload,
  OrbMoviePayload,
  OrbProposalPayload,
  OrbProposalToolName,
} from "@/types/orb";

const MOVIE_STATUS_LABEL: Record<MovieStatus, string> = {
  to_watch: "pra assistir",
  watching: "assistindo",
  watched: "assistido",
  abandoned: "abandonado",
};

const BOOK_STATUS_LABEL: Record<BookStatus, string> = {
  to_read: "pra ler",
  reading: "lendo",
  read: "lido",
  abandoned: "abandonado",
};

const ALBUM_STATUS_LABEL: Record<AlbumStatus, string> = {
  to_listen: "pra ouvir",
  listened: "ouvido",
};

/** Texto humano do ActionCard a partir do payload tipado da proposal (puro, sem I/O). */
export function buildProposalSummary(
  toolName: OrbProposalToolName,
  payload: OrbProposalPayload
): string {
  switch (toolName) {
    case "propose_mark_movie": {
      const movie = payload as OrbMoviePayload;
      return describeEntry(
        movie.title,
        MOVIE_STATUS_LABEL[movie.status] ?? movie.status,
        movie.rating
      );
    }
    case "propose_mark_book": {
      const book = payload as OrbBookPayload;
      return describeEntry(
        book.title,
        BOOK_STATUS_LABEL[book.status] ?? book.status,
        book.rating
      );
    }
    case "propose_mark_album": {
      const album = payload as OrbAlbumPayload;
      return describeEntry(
        album.title,
        ALBUM_STATUS_LABEL[album.status] ?? album.status,
        album.rating
      );
    }
    default:
      return "Aplicar alteração";
  }
}

function describeEntry(
  title: string,
  statusLabel: string,
  rating?: number | null
): string {
  const ratingPart = rating != null ? `, nota ${formatRating(rating)}` : "";
  return `Marcar "${title}" como ${statusLabel}${ratingPart}`;
}

function formatRating(rating: number): string {
  return Number.isInteger(rating) ? String(rating) : rating.toFixed(1);
}
