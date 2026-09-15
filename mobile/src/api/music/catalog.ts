import { supabase } from "@/lib/supabase";
import type { AlbumType } from "@/types/music";

export type AlbumSearchHit = {
  musicbrainz_id: string;
  title: string;
  artists: string[];
  release_year: number | null;
  album_type: AlbumType;
  cover_url: string | null;
};

type InvokeOkSearch = {
  albums?: Array<{
    id: string;
    title: string;
    artists: string[];
    release_year: number | null;
    album_type: AlbumType;
    cover_url: string | null;
  }>;
  error?: string;
  code?: string;
};

export async function searchAlbumCatalog(query: string): Promise<AlbumSearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  const { data, error } = await supabase.functions.invoke("spotify-catalog", {
    body: { action: "search", query: q },
  });
  if (error) throw new Error("Não foi possível consultar o catálogo de música.");
  const payload = data as InvokeOkSearch;
  if (payload?.error) {
    throw new Error("Catálogo de música temporariamente indisponível.");
  }
  return (payload.albums ?? [])
    .filter((album) => album.album_type === "album" || album.album_type === "ep")
    .map((album) => ({
      musicbrainz_id: album.id,
      title: album.title,
      artists: album.artists,
      release_year: album.release_year,
      album_type: album.album_type,
      cover_url: album.cover_url,
    }));
}

export type AlbumTrack = {
  disc: number;
  position: string;
  title: string;
  lengthMs: number | null;
};

type InvokeOkAlbum = {
  album?: {
    tracks?: AlbumTrack[];
  } | null;
  error?: string;
};

export async function fetchAlbumTracks(albumId: string): Promise<AlbumTrack[]> {
  const id = albumId.trim();
  if (!id || id.startsWith("manual_")) return [];
  const { data, error } = await supabase.functions.invoke("spotify-catalog", {
    body: { action: "album", id },
  });
  if (error) return [];
  const payload = data as InvokeOkAlbum;
  if (payload?.error) return [];
  return payload.album?.tracks ?? [];
}
