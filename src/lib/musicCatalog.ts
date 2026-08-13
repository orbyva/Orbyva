/**
 * Catálogo de música: Spotify primeiro, MusicBrainz como fallback.
 */
import type { AlbumSource } from "@/types/music";
import {
  coverArtUrl,
  fetchMusicBrainzAlbumMeta,
  fetchMusicBrainzTracklist,
  searchMusicBrainz,
  type AlbumSearchHit,
  type AlbumTrack,
} from "@/lib/musicbrainz";
import {
  fetchSpotifyAlbumBundle,
  fetchSpotifyAlbumMeta,
  fetchSpotifyTracklist,
  searchSpotifyAlbums,
  SpotifyNotConfiguredError,
  spotifyCoverFull,
} from "@/lib/spotify";

export type { AlbumSearchHit, AlbumTrack };
export type CatalogProvider = "spotify" | "musicbrainz";

export type CatalogSearchResult = {
  hits: AlbumSearchHit[];
  provider: CatalogProvider;
};

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

/** Busca álbuns/EPs, Spotify preferido; MB se não configurado, erro ou vazio. */
export async function searchAlbums(
  query: string,
  signal?: AbortSignal
): Promise<CatalogSearchResult> {
  try {
    const hits = await searchSpotifyAlbums(query, signal);
    if (hits.length > 0) return { hits, provider: "spotify" };
  } catch (error) {
    if (isAbortError(error)) throw error;
    if (!(error instanceof SpotifyNotConfiguredError)) {
      console.warn("[musicCatalog] Spotify search falhou, fallback MB:", error);
    }
  }

  const hits = await searchMusicBrainz(query, signal);
  return { hits, provider: "musicbrainz" };
}

export function catalogCoverUrl(
  hit: AlbumSearchHit,
  provider: CatalogProvider,
  size: 250 | 500 = 500
): string | null {
  if (provider === "spotify") {
    return spotifyCoverFull(hit.cover_url) ?? hit.cover_url;
  }
  return coverArtUrl(hit.musicbrainz_id, size);
}

export async function fetchCatalogAlbumMeta(
  catalogId: string,
  source: AlbumSource,
  signal?: AbortSignal
): Promise<AlbumSearchHit | null> {
  if (source === "manual" || catalogId.startsWith("manual_")) return null;

  if (source === "spotify") {
    try {
      return await fetchSpotifyAlbumMeta(catalogId, signal);
    } catch (error) {
      if (isAbortError(error)) throw error;
      console.warn("[musicCatalog] Spotify meta falhou:", error);
      return null;
    }
  }

  if (source === "musicbrainz") {
    return fetchMusicBrainzAlbumMeta(catalogId, signal);
  }

  // source desconhecido: tenta Spotify depois MB
  try {
    const sp = await fetchSpotifyAlbumMeta(catalogId, signal);
    if (sp) return sp;
  } catch (error) {
    if (isAbortError(error)) throw error;
  }
  return fetchMusicBrainzAlbumMeta(catalogId, signal);
}

export async function fetchCatalogTracklist(
  catalogId: string,
  source: AlbumSource,
  preferredTitle?: string,
  signal?: AbortSignal
): Promise<AlbumTrack[]> {
  if (source === "manual" || catalogId.startsWith("manual_")) return [];

  if (source === "spotify") {
    try {
      return await fetchSpotifyTracklist(catalogId, signal);
    } catch (error) {
      if (isAbortError(error)) throw error;
      console.warn("[musicCatalog] Spotify tracklist falhou:", error);
      return [];
    }
  }

  if (source === "musicbrainz") {
    return fetchMusicBrainzTracklist(catalogId, preferredTitle, signal);
  }

  try {
    const bundle = await fetchSpotifyAlbumBundle(catalogId, signal);
    if (bundle?.tracks.length) return bundle.tracks;
  } catch (error) {
    if (isAbortError(error)) throw error;
  }
  return fetchMusicBrainzTracklist(catalogId, preferredTitle, signal);
}

export function isCatalogSyncedSource(source: AlbumSource, id: string): boolean {
  if (id.startsWith("manual_")) return false;
  return source === "spotify" || source === "musicbrainz";
}
