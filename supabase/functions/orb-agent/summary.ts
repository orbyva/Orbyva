/** Duplica `src/domain/orb/proposalSummary.ts` — Deno não importa de `src/`. Manter em sincronia. */

const MOVIE_STATUS_LABEL: Record<string, string> = {
  to_watch: "pra assistir",
  watching: "assistindo",
  watched: "assistido",
  abandoned: "abandonado",
};

const BOOK_STATUS_LABEL: Record<string, string> = {
  to_read: "pra ler",
  reading: "lendo",
  read: "lido",
  abandoned: "abandonado",
};

const ALBUM_STATUS_LABEL: Record<string, string> = {
  to_listen: "pra ouvir",
  listened: "ouvido",
};

function formatRating(rating: number): string {
  return Number.isInteger(rating) ? String(rating) : rating.toFixed(1);
}

function describeEntry(
  title: string,
  statusLabel: string,
  rating?: number | null
): string {
  const ratingPart = rating != null ? `, nota ${formatRating(rating)}` : "";
  return `Marcar "${title}" como ${statusLabel}${ratingPart}`;
}

export function summarizeMovieProposal(payload: {
  title: string;
  status: string;
  rating?: number | null;
}): string {
  return describeEntry(
    payload.title,
    MOVIE_STATUS_LABEL[payload.status] ?? payload.status,
    payload.rating
  );
}

export function summarizeBookProposal(payload: {
  title: string;
  status: string;
  rating?: number | null;
}): string {
  return describeEntry(
    payload.title,
    BOOK_STATUS_LABEL[payload.status] ?? payload.status,
    payload.rating
  );
}

export function summarizeAlbumProposal(payload: {
  title: string;
  status: string;
  rating?: number | null;
}): string {
  return describeEntry(
    payload.title,
    ALBUM_STATUS_LABEL[payload.status] ?? payload.status,
    payload.rating
  );
}
