/**
 * Cliente Spotify via Edge Function `spotify-catalog` (Client Credentials no servidor).
 */
import { supabase } from "@/lib/supabase";
import type { AlbumType } from "@/types/music";
import type { AlbumSearchHit, AlbumTrack } from "@/lib/musicbrainz";

export type SpotifyCatalogAlbum = {
  id: string;
  title: string;
  artists: string[];
  release_year: number | null;
  album_type: AlbumType;
  cover_url: string | null;
  total_tracks?: number | null;
  tracks?: AlbumTrack[];
};

type InvokeOkSearch = { albums: SpotifyCatalogAlbum[] };
type InvokeOkAlbum = { album: (SpotifyCatalogAlbum & { tracks: AlbumTrack[] }) | null };
type InvokeErr = { error?: string; code?: string; detail?: string };

const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
const searchCache = new Map<
  string,
  { at: number; hits: AlbumSearchHit[] }
>();

export class SpotifyNotConfiguredError extends Error {
  readonly code = "SPOTIFY_NOT_CONFIGURED";
  constructor(message = "Catálogo de música não configurado") {
    super(message);
    this.name = "SpotifyNotConfiguredError";
  }
}

/** Evita expor o provedor em toasts/erros da UI. */
function publicCatalogError(raw: string | undefined, fallback: string): string {
  if (!raw?.trim()) return fallback;
  if (/spotify/i.test(raw)) return fallback;
  return raw;
}

function toSearchHit(album: SpotifyCatalogAlbum): AlbumSearchHit {
  return {
    musicbrainz_id: album.id,
    title: album.title,
    artists: album.artists,
    release_year: album.release_year,
    album_type: album.album_type,
    cover_url: toProxiedSpotifyCover(album.cover_url),
  };
}

/** Same-origin proxy para capas (CORS/canvas do share). */
export function toProxiedSpotifyCover(
  src: string | null | undefined
): string | null {
  if (!src) return null;
  try {
    const u = new URL(src, typeof window !== "undefined" ? window.location.origin : "https://orbyva.app");
    if (
      u.hostname === "i.scdn.co" ||
      u.hostname.endsWith(".scdn.co") ||
      u.hostname === "mosaic.scdn.co"
    ) {
      return `/spotify-media${u.pathname}${u.search}`;
    }
    if (u.pathname.startsWith("/spotify-media")) {
      return `${u.pathname}${u.search}`;
    }
  } catch {
    /* ignore */
  }
  return src;
}

export function spotifyCoverFull(src: string | null | undefined): string | null {
  if (!src) return null;
  return toProxiedSpotifyCover(src) ?? src;
}

async function invokeCatalog<T>(
  body: Record<string, unknown>
): Promise<T> {
  const { data, error } = await supabase.functions.invoke("spotify-catalog", {
    body,
  });

  if (error) {
    // Functions HTTP errors often put JSON in context
    const ctx = error as { context?: Response; message?: string };
    if (ctx.context) {
      try {
        const payload = (await ctx.context.json()) as InvokeErr;
        if (payload.code === "SPOTIFY_NOT_CONFIGURED") {
          throw new SpotifyNotConfiguredError();
        }
        throw new Error(
          publicCatalogError(payload.error, error.message || "Falha ao consultar o catálogo")
        );
      } catch (e) {
        if (e instanceof SpotifyNotConfiguredError) throw e;
        if (e instanceof Error && e.message !== error.message) throw e;
      }
    }
    throw new Error(error.message || "Falha ao consultar o catálogo");
  }

  const payload = data as T & InvokeErr;
  if (payload && typeof payload === "object" && "error" in payload && payload.error) {
    if (payload.code === "SPOTIFY_NOT_CONFIGURED") {
      throw new SpotifyNotConfiguredError();
    }
    throw new Error(
      publicCatalogError(payload.error, "Falha ao consultar o catálogo")
    );
  }

  return payload;
}

export async function searchSpotifyAlbums(
  query: string,
  signal?: AbortSignal
): Promise<AlbumSearchHit[]> {
  const q = query.trim();
  if (!q) return [];

  const cacheKey = `sp:${q.toLowerCase()}`;
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.at < SEARCH_CACHE_TTL_MS) {
    return cached.hits;
  }

  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const data = await invokeCatalog<InvokeOkSearch>({
    action: "search",
    query: q,
  });

  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const hits = (data.albums ?? [])
    .filter((a) => a.album_type === "album" || a.album_type === "ep")
    .map(toSearchHit);

  searchCache.set(cacheKey, { at: Date.now(), hits });
  return hits;
}

export async function fetchSpotifyAlbumMeta(
  albumId: string,
  signal?: AbortSignal
): Promise<AlbumSearchHit | null> {
  const id = albumId.trim();
  if (!id || id.startsWith("manual_")) return null;

  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const data = await invokeCatalog<InvokeOkAlbum>({
    action: "album",
    id,
  });

  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  if (!data.album) return null;

  return {
    ...toSearchHit(data.album),
    cover_url: spotifyCoverFull(data.album.cover_url),
  };
}

export async function fetchSpotifyTracklist(
  albumId: string,
  signal?: AbortSignal
): Promise<AlbumTrack[]> {
  const id = albumId.trim();
  if (!id || id.startsWith("manual_")) return [];

  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const data = await invokeCatalog<InvokeOkAlbum>({
    action: "album",
    id,
  });

  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  return data.album?.tracks ?? [];
}

export async function fetchSpotifyAlbumBundle(
  albumId: string,
  signal?: AbortSignal
): Promise<{
  meta: AlbumSearchHit;
  tracks: AlbumTrack[];
} | null> {
  const id = albumId.trim();
  if (!id || id.startsWith("manual_")) return null;

  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const data = await invokeCatalog<InvokeOkAlbum>({
    action: "album",
    id,
  });

  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  if (!data.album) return null;

  return {
    meta: {
      ...toSearchHit(data.album),
      cover_url: spotifyCoverFull(data.album.cover_url),
    },
    tracks: data.album.tracks ?? [],
  };
}
