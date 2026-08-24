import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth-user";
import { normalizeAlbum } from "@/domain/music";
import {
  mergeEntertainmentDates,
  mergeEntertainmentScalars,
  mergeTrackRatings,
} from "@/domain/orb/mergeEntertainment";
import type {
  Album,
  AlbumCreateRequest,
  AlbumStatus,
  AlbumUpdateRequest,
} from "@/types/music";

function albumDbFields(
  album: Partial<AlbumCreateRequest> & { musicbrainz_id?: string }
) {
  return {
    ...(album.musicbrainz_id !== undefined
      ? { musicbrainz_id: album.musicbrainz_id }
      : {}),
    ...(album.title !== undefined ? { title: album.title } : {}),
    ...(album.artists !== undefined ? { artists: album.artists } : {}),
    ...(album.release_year !== undefined
      ? { release_year: album.release_year }
      : {}),
    ...(album.album_type !== undefined ? { album_type: album.album_type } : {}),
    ...(album.cover_url !== undefined ? { cover_url: album.cover_url } : {}),
    ...(album.source !== undefined ? { source: album.source } : {}),
    ...(album.status !== undefined ? { status: album.status } : {}),
    ...(album.rating !== undefined ? { rating: album.rating } : {}),
    ...(album.notes !== undefined ? { notes: album.notes } : {}),
    ...(album.would_recommend !== undefined
      ? { would_recommend: album.would_recommend }
      : {}),
    ...(album.is_favorite !== undefined
      ? { is_favorite: album.is_favorite }
      : {}),
    ...(album.listened_dates !== undefined
      ? { listened_dates: album.listened_dates }
      : {}),
    ...(album.track_ratings !== undefined
      ? { track_ratings: album.track_ratings }
      : {}),
  };
}

export async function fetchAlbums(
  status: AlbumStatus,
  page: number,
  pageSize: number
): Promise<{ data: Album[]; total: number }> {
  const userId = await getCurrentUserId();
  const { data, error, count } = await supabase
    .from("album")
    .select("*", { count: "exact" })
    .eq("user_id", userId)
    .eq("status", status)
    .order(status === "listened" ? "listened_dates" : "release_year", {
      ascending: false,
      nullsFirst: false,
    })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (error) throw new Error(error.message);
  return {
    data: (data || []).map((row) => normalizeAlbum(row as Album)),
    total: count || 0,
  };
}

/** Lista completa do usuário, filtro/paginação no cliente. */
export async function fetchAllAlbums(): Promise<Album[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("album")
    .select("*")
    .eq("user_id", userId);

  if (error) throw new Error(error.message);
  return (data || []).map((row) => normalizeAlbum(row as Album));
}

export async function fetchAlbumById(
  musicbrainzId: string
): Promise<Album | null> {
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

export async function updateAlbum(
  updateData: AlbumUpdateRequest
): Promise<void> {
  const userId = await getCurrentUserId();
  const { musicbrainz_id, ...rest } = updateData;
  const { error } = await supabase
    .from("album")
    .update(albumDbFields(rest))
    .eq("user_id", userId)
    .eq("musicbrainz_id", musicbrainz_id);
  if (error) throw new Error(error.message);
}

/** Cria se `musicbrainz_id` for inédito, senão faz merge não-destrutivo (mesmo padrão de `upsertMovie`). */
export async function upsertAlbum(
  album: AlbumCreateRequest
): Promise<"created" | "updated"> {
  const existing = await fetchAlbumById(album.musicbrainz_id);
  if (!existing) {
    await createAlbum(album);
    return "created";
  }

  const scalars = mergeEntertainmentScalars(existing, album);
  await updateAlbum({
    musicbrainz_id: album.musicbrainz_id,
    ...scalars,
    listened_dates: mergeEntertainmentDates(
      existing.listened_dates,
      album.listened_dates
    ),
    track_ratings: mergeTrackRatings(
      existing.track_ratings,
      album.track_ratings
    ),
  });
  return "updated";
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

/** Upload de capa manual → URL pública do Storage. */
export async function uploadAlbumCover(
  musicbrainzId: string,
  file: File
): Promise<string> {
  const userId = await getCurrentUserId();
  const ext =
    file.type === "image/png"
      ? "png"
      : file.type === "image/webp"
        ? "webp"
        : "jpg";
  const path = `${userId}/${musicbrainzId}.${ext}`;

  const { error } = await supabase.storage
    .from("album-covers")
    .upload(path, file, { upsert: true, contentType: file.type });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from("album-covers").getPublicUrl(path);
  return data.publicUrl;
}
