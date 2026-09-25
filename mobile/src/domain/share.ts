import {
  formatAuthors,
  formatBookRating,
  getBookRatingLabel,
} from "@/domain/books";
import {
  formatAlbumRating,
  formatArtists,
  getAlbumRatingLabel,
  type RatedAlbumTrack,
} from "@/domain/music";
import {
  formatMovieRating,
  getMovieRatingLabel,
  pickEpisodesForShare,
  type RatedShareEpisode,
} from "@/domain/movies";
import {
  formatRating,
  getRatingLabel,
  PLACE_TYPE_EMOJI,
} from "@/domain/places";
import { BRAND } from "@/lib/brand";
import { formatBRL, formatDateBR } from "@/lib/currency";
import type { Album } from "@/types/music";
import type { Book } from "@/types/books";
import type { Movie } from "@/types/movies";
import type { PlaceVisit } from "@/types/places";
import type { Trip } from "@/types/travel";

export function usableCoverUri(uri?: string | null): string | null {
  if (!uri || uri === "N/A") return null;
  return uri;
}

export function buildMovieShareText(
  movie: Movie,
  options: {
    includeNotes?: boolean;
    ratedEpisodes?: RatedShareEpisode[];
  } = {}
): string {
  const includeNotes = options.includeNotes !== false;
  const parts = [`🎬 ${movie.title} (${movie.year})`];
  if (movie.rating != null && movie.rating > 0) {
    parts.push(
      `⭐ ${formatMovieRating(movie.rating)}/10 · ${getMovieRatingLabel(movie.rating)}`
    );
  }
  if (includeNotes && movie.notes?.trim()) {
    parts.push(`💬 ${movie.notes.trim()}`);
  }
  const rated = options.ratedEpisodes ?? [];
  if (rated.length) {
    parts.push("Episódios:");
    const shown = pickEpisodesForShare(rated, 12);
    for (const episode of shown) {
      parts.push(
        `• S${episode.season}E${episode.episode} ${episode.title}, ${formatMovieRating(episode.rating)}/10`
      );
    }
    if (rated.length > shown.length) {
      parts.push(`• +${rated.length - shown.length} episódios`);
    }
  }
  if (movie.would_recommend === false) {
    parts.push("👎 Não recomendaria");
  } else if (movie.status === "watched") {
    parts.push("👍 Recomendaria");
  }
  parts.push(`via ${BRAND.name}`);
  return parts.join("\n");
}

export function buildBookShareText(
  book: Book,
  options: { includeNotes?: boolean } = {}
): string {
  const includeNotes = options.includeNotes !== false;
  const parts = [`📖 ${book.title}`];
  if (book.authors.length) parts.push(formatAuthors(book.authors));
  if (book.rating != null && book.rating > 0) {
    parts.push(
      `Nota ${formatBookRating(book.rating)}/10 · ${getBookRatingLabel(book.rating)}`
    );
  }
  if (includeNotes && book.notes?.trim()) {
    parts.push(`💬 ${book.notes.trim()}`);
  }
  parts.push(
    book.would_recommend !== false ? "👍 Recomendaria" : "👎 Não recomendaria"
  );
  parts.push(`via ${BRAND.name}`);
  return parts.join("\n");
}

export function buildAlbumShareText(
  album: Album,
  options: { includeNotes?: boolean; ratedTracks?: RatedAlbumTrack[] } = {}
): string {
  const includeNotes = options.includeNotes !== false;
  const parts = [`💿 ${album.title}`];
  if (album.artists.length) parts.push(formatArtists(album.artists));
  if (album.rating != null && album.rating > 0) {
    parts.push(
      `Nota ${formatAlbumRating(album.rating)}/10 · ${getAlbumRatingLabel(album.rating)}`
    );
  }
  if (includeNotes && album.notes?.trim()) {
    parts.push(`💬 ${album.notes.trim()}`);
  }
  const rated = options.ratedTracks ?? [];
  if (rated.length) {
    parts.push("Faixas:");
    for (const track of rated.slice(0, 12)) {
      const idx = track.disc > 1 ? `${track.disc}.${track.position}` : track.position;
      parts.push(
        `• ${idx}. ${track.title}, ${formatAlbumRating(track.rating)}/10`
      );
    }
    if (rated.length > 12) {
      parts.push(`• +${rated.length - 12} faixas`);
    }
  }
  parts.push(
    album.would_recommend !== false ? "👍 Recomendaria" : "👎 Não recomendaria"
  );
  parts.push(`via ${BRAND.name}`);
  return parts.join("\n");
}

export function buildPlaceShareText(
  place: PlaceVisit,
  options: { includeNotes?: boolean } = {}
): string {
  const includeNotes = options.includeNotes !== false;
  const parts = [`📍 ${place.name}`];
  if (place.rating != null && place.rating > 0) {
    parts.push(
      `Nota ${formatRating(place.rating)}/5 · ${getRatingLabel(place.rating)}`
    );
  }
  if (place.amount != null && place.amount > 0) {
    parts.push(`💰 ${formatBRL(place.amount)}`);
  }
  if (includeNotes && place.notes?.trim()) {
    parts.push(`💬 ${place.notes.trim()}`);
  }
  parts.push(
    place.would_recommend !== false ? "👍 Recomendaria" : "👎 Não recomendaria"
  );
  parts.push(`via ${BRAND.name}`);
  return parts.join("\n");
}

export function buildTripShareText(
  trip: Trip,
  places: PlaceVisit[] = []
): string {
  const parts = [`✈️ ${trip.title}`];
  if (trip.destination) parts.push(trip.destination);
  parts.push(
    `${formatDateBR(trip.start_date)} → ${formatDateBR(trip.end_date)}`
  );
  if (places.length > 0) {
    parts.push("");
    for (const place of places) {
      const emoji = PLACE_TYPE_EMOJI[place.type] ?? "📍";
      const score =
        place.rating != null && place.rating > 0
          ? `, ${formatRating(place.rating)}/5`
          : "";
      parts.push(`${emoji} ${place.name}${score}`);
    }
  }
  parts.push(`via ${BRAND.name}`);
  return parts.join("\n");
}
