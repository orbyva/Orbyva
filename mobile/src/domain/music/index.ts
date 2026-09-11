import type { Album, AlbumRatingFloor, AlbumStatus, AlbumType } from "@/types/music";
import {
  activityTouchesYear,
  appendActivityDate,
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

export function formatArtists(artists: string[]): string {
  if (!artists.length) return "Artista desconhecido";
  if (artists.length === 1) return artists[0];
  if (artists.length === 2) return `${artists[0]} e ${artists[1]}`;
  return `${artists[0]} e outros`;
}

export function getLatestListenedDate(dates: Album["listened_dates"]): string | null {
  if (!dates?.length) return null;
  const sorted = [...dates].map((d) => String(d).slice(0, 10)).sort();
  return sorted[sorted.length - 1] ?? null;
}

export function newManualAlbumId(): string {
  const id =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `manual_${id}`;
}

export function albumStatusUpdate(
  album: Album,
  status: AlbumStatus,
  todayIso: string
): { musicbrainz_id: string; status: AlbumStatus; listened_dates: string[] } {
  const dates = normalizeEntertainmentDates(album.listened_dates);
  return {
    musicbrainz_id: album.musicbrainz_id,
    status,
    listened_dates:
      status === "listened" ? appendActivityDate(dates, todayIso) : dates,
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

export function collectAlbumTypes(albums: Album[]): AlbumType[] {
  const set = new Set<AlbumType>();
  for (const album of albums) {
    if (album.album_type) set.add(album.album_type);
  }
  return [...set].sort();
}

export function filterAlbumsByMeta(
  albums: Album[],
  options: { albumType: string; minRating: AlbumRatingFloor }
): Album[] {
  return albums.filter((album) => {
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

export type AlbumLibraryStats = {
  listened: number;
  toListen: number;
  favorites: number;
  thisYear: number;
};

export function getAlbumLibraryStats(
  albums: Album[],
  year = new Date().getFullYear()
): AlbumLibraryStats {
  const listened = albums.filter((album) => album.status === "listened");
  return {
    listened: listened.length,
    toListen: albums.filter((album) => album.status === "to_listen").length,
    favorites: listened.filter((album) => isEntertainmentFavorite(album)).length,
    thisYear: listened.filter((album) =>
      activityTouchesYear(album.listened_dates, year, album.created_at)
    ).length,
  };
}

export function pickRandomToListenAlbum(albums: Album[]): Album | null {
  return pickRandomItem(albums.filter((album) => album.status === "to_listen"));
}

export function formatTrackLength(lengthMs: number | null): string {
  if (lengthMs == null || lengthMs <= 0) return "·";
  const totalSec = Math.round(lengthMs / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
