import { getCurrentUserId } from "@/lib/auth-user";
import { supabase } from "@/lib/supabase";
import { normalizeAlbum } from "@/domain/music";
import { normalizeEntertainmentDates } from "@/domain/entertainment/insights";
import type { Album, AlbumCreateRequest, AlbumUpdateRequest } from "@/types/music";

function albumDbFields(
  album: Partial<AlbumCreateRequest> & { musicbrainz_id?: string }
) {
  return {
    ...(album.musicbrainz_id !== undefined
      ? { musicbrainz_id: album.musicbrainz_id }
      : {}),
    ...(album.title !== undefined ? { title: album.title } : {}),
    ...(album.artists !== undefined ? { artists: album.artists } : {}),
    ...(album.release_year !== undefined ? { release_year: album.release_year } : {}),
    ...(album.album_type !== undefined ? { album_type: album.album_type } : {}),
    ...(album.cover_url !== undefined ? { cover_url: album.cover_url } : {}),
    ...(album.source !== undefined ? { source: album.source } : {}),
    ...(album.status !== undefined ? { status: album.status } : {}),
    ...(album.rating !== undefined ? { rating: album.rating } : {}),
    ...(album.notes !== undefined ? { notes: album.notes } : {}),
    ...(album.would_recommend !== undefined
      ? { would_recommend: album.would_recommend }
      : {}),
    ...(album.is_favorite !== undefined ? { is_favorite: album.is_favorite } : {}),
    ...(album.track_ratings !== undefined ? { track_ratings: album.track_ratings } : {}),
    ...(album.listened_dates !== undefined
      ? { listened_dates: normalizeEntertainmentDates(album.listened_dates) }
      : {}),
  };
}

export async function fetchAllAlbums(): Promise<Album[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase.from("album").select("*").eq("user_id", userId);
  if (error) throw new Error(error.message);
  return (data || []).map((row) => normalizeAlbum(row as Album));
}

export async function fetchAlbumById(musicbrainzId: string): Promise<Album | null> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("album")
    .select("*")
    .eq("user_id", userId)
    .eq("musicbrainz_id", musicbrainzId)
    .maybeSingle();
  if (error) return null;
  return data ? normalizeAlbum(data as Album) : null;
}

export async function createAlbum(album: AlbumCreateRequest): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase.from("album").insert([
    {
      ...albumDbFields(album),
      user_id: userId,
      notes: album.notes ?? null,
      would_recommend: album.would_recommend ?? true,
      is_favorite: album.is_favorite === true,
      track_ratings: album.track_ratings ?? {},
    },
  ]);
  if (error) throw new Error(error.message);
}

export async function updateAlbum(updateData: AlbumUpdateRequest): Promise<void> {
  const userId = await getCurrentUserId();
  const { musicbrainz_id, ...rest } = updateData;
  const { error } = await supabase
    .from("album")
    .update(albumDbFields(rest))
    .eq("user_id", userId)
    .eq("musicbrainz_id", musicbrainz_id);
  if (error) throw new Error(error.message);
}

export async function deleteAlbum(musicbrainzId: string): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("album")
    .delete()
    .eq("user_id", userId)
    .eq("musicbrainz_id", musicbrainzId);
  if (error) throw new Error(error.message);
}
