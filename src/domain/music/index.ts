import type {
  Album,
  AlbumRatingFloor,
  AlbumStatus,
  AlbumType,
} from "@/types/music";
import {
  activityTouchesYear,
  isEntertainmentFavorite,
  normalizeEntertainmentDates,
  pickRandomItem,
} from "@/domain/entertainment/insights";

export const ALBUM_STATUS_LABELS: Record<AlbumStatus, string> = {
  to_listen: "Para ouvir",
  listened: "Ouvido",
};

export const ALBUM_TYPE_LABELS: Record<AlbumType, string> = {
  album: "Álbum",
  ep: "EP",
  single: "Single",
  compilation: "Coletânea",
  other: "Outro",
};

/** Tipos oferecidos na busca/cadastro (singles etc. ficam fora de propósito). */
export const ALBUM_TYPES_FOR_ADD: AlbumType[] = ["album", "ep"];

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

export function normalizeAlbum(raw: Album): Album {
  return {
    ...raw,
    artists: asStringList(raw.artists),
    album_type: raw.album_type || "album",
    source: raw.source || "musicbrainz",
    listened_dates: normalizeEntertainmentDates(raw.listened_dates),
    would_recommend: raw.would_recommend !== false,
    is_favorite: raw.is_favorite === true,
    track_ratings: normalizeTrackRatings(raw.track_ratings),
  };
}

export function trackRatingKey(disc: number, position: string): string {
  return `${disc}:${String(position).trim()}`;
}

export function normalizeTrackRatings(
  value: unknown
): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const n = typeof raw === "number" ? raw : Number(raw);
    if (Number.isFinite(n) && n >= 0 && n <= 10) out[key] = n;
  }
  return out;
}

export type RatedAlbumTrack = {
  disc: number;
  position: string;
  title: string;
  rating: number;
};

/** Cruza notas salvas com a tracklist, preservando a ordem do álbum. */
export function resolveRatedAlbumTracks(
  ratings: Record<string, number> | undefined,
  tracks: { disc: number; position: string; title: string }[]
): RatedAlbumTrack[] {
  const map = ratings ?? {};
  if (!Object.keys(map).length || !tracks.length) return [];

  const rated: RatedAlbumTrack[] = [];
  for (const track of tracks) {
    const rating = map[trackRatingKey(track.disc, track.position)];
    if (!(rating > 0)) continue;
    rated.push({
      disc: track.disc,
      position: track.position,
      title: track.title,
      rating,
    });
  }
  return rated;
}

export function formatAlbumRating(rating: number): string {
  return Number.isInteger(rating)
    ? String(rating)
    : rating.toFixed(1).replace(".", ",");
}

export function getAlbumRatingLabel(rating: number): string {
  if (rating >= 9) return "Obra-prima";
  if (rating >= 8) return "Excelente";
  if (rating >= 7) return "Muito bom";
  if (rating >= 6) return "Bom";
  if (rating >= 4) return "Regular";
  if (rating >= 2) return "Fraco";
  return "Ruim";
}

export function getDisplayAlbumScore(album: Album): string | number {
  if (album.status === "listened") {
    return album.rating != null ? formatAlbumRating(album.rating) : "—";
  }
  return "—";
}

export function getAlbumCardRating(album: Album): string | null {
  if (album.status === "listened" && album.rating != null && album.rating > 0) {
    return formatAlbumRating(album.rating);
  }
  return null;
}

export function getLatestListenedDate(
  dates: Album["listened_dates"]
): string | null {
  if (!dates?.length) return null;
  const sorted = [...dates].map((d) => String(d).slice(0, 10)).sort();
  return sorted[sorted.length - 1] ?? null;
}

export function formatArtists(artists: string[]): string {
  if (!artists.length) return "Artista desconhecido";
  if (artists.length === 1) return artists[0];
  if (artists.length === 2) return `${artists[0]} e ${artists[1]}`;
  return `${artists[0]} e outros`;
}

export function collectAlbumArtists(albums: Album[]): string[] {
  const set = new Set<string>();
  for (const a of albums) {
    for (const name of a.artists ?? []) {
      if (name.trim()) set.add(name.trim());
    }
  }
  return [...set].sort((x, y) => x.localeCompare(y, "pt-BR"));
}

export function collectAlbumTypes(albums: Album[]): AlbumType[] {
  const set = new Set<AlbumType>();
  for (const a of albums) {
    if (a.album_type) set.add(a.album_type);
  }
  return [...set].sort();
}

export function filterAlbumsByMeta(
  albums: Album[],
  options: {
    artist: string;
    albumType: string;
    minRating: AlbumRatingFloor;
  }
): Album[] {
  return albums.filter((album) => {
    if (
      options.artist !== "all" &&
      !(album.artists ?? []).includes(options.artist)
    ) {
      return false;
    }
    if (options.albumType !== "all" && album.album_type !== options.albumType) {
      return false;
    }
    if (options.minRating !== "all") {
      const min = Number(options.minRating);
      if ((album.rating ?? 0) < min) return false;
    }
    return true;
  });
}

export function getListenedAlbumsStats(albums: Album[]): {
  avgRating: number | null;
  rated: number;
} {
  const rated = albums.filter((a) => a.rating != null && a.rating > 0);
  if (rated.length === 0) return { avgRating: null, rated: 0 };
  const sum = rated.reduce((acc, a) => acc + (a.rating ?? 0), 0);
  return {
    avgRating: Math.round((sum / rated.length) * 10) / 10,
    rated: rated.length,
  };
}

export type AlbumLibraryStats = {
  listened: number;
  toListen: number;
  favorites: number;
  thisYear: number;
  rated: number;
  avgRating: number | null;
};

/** Agrega a biblioteca completa (todas as abas). */
export function getAlbumLibraryStats(
  albums: Album[],
  year = new Date().getFullYear()
): AlbumLibraryStats {
  const listened = albums.filter((a) => a.status === "listened");
  const rated = listened.filter((a) => a.rating != null && a.rating > 0);
  const avgRating =
    rated.length === 0
      ? null
      : Math.round(
          (rated.reduce((s, a) => s + (a.rating ?? 0), 0) / rated.length) * 10
        ) / 10;

  return {
    listened: listened.length,
    toListen: albums.filter((a) => a.status === "to_listen").length,
    favorites: listened.filter((a) => isEntertainmentFavorite(a)).length,
    thisYear: listened.filter((a) =>
      activityTouchesYear(a.listened_dates, year, a.created_at)
    ).length,
    rated: rated.length,
    avgRating,
  };
}

export function pickRandomAlbum(albums: Album[]): Album | null {
  return pickRandomItem(albums);
}

export function pickRandomToListenAlbum(albums: Album[]): Album | null {
  return pickRandomItem(albums.filter((a) => a.status === "to_listen"));
}

export function newManualAlbumId(): string {
  return `manual_${crypto.randomUUID()}`;
}

export function formatTrackLength(lengthMs: number | null): string {
  if (lengthMs == null || lengthMs <= 0) return "—";
  const totalSec = Math.round(lengthMs / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Heurística leve p/ pré-preencher cadastro manual a partir da busca. */
export function parseAlbumSearchQuery(raw: string): {
  title: string;
  artists: string;
} {
  const q = raw.trim();
  if (!q) return { title: "", artists: "" };

  const byMatch = q.match(/^(.+?)\s+by\s+(.+)$/i);
  if (byMatch) {
    return { title: byMatch[1].trim(), artists: byMatch[2].trim() };
  }

  const dashParts = q.split(/\s+[-–—]\s+/);
  if (dashParts.length === 2 && dashParts[0] && dashParts[1]) {
    // Padrão comum: "Artista - Álbum"
    return { title: dashParts[1].trim(), artists: dashParts[0].trim() };
  }

  return { title: q, artists: "" };
}
