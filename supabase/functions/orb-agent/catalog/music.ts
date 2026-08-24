/**
 * Catálogo de álbuns pro Orb: Spotify (function-to-function, repassa JWT do
 * usuário) com fallback MusicBrainz (API pública, direto — sem proxy same-origin
 * porque aqui não há CORS de browser envolvido).
 */

export type AlbumType = "album" | "ep" | "single" | "compilation" | "other";

export type AlbumCandidate = {
  id: string;
  source: "spotify" | "musicbrainz";
  title: string;
  artists: string[];
  release_year: number | null;
  album_type: AlbumType;
  cover_url: string | null;
};

const MB_API = "https://musicbrainz.org/ws/2";
const CAA = "https://coverartarchive.org";
const USER_AGENT = "Orbyva-Orb/1.0 (https://orbyva.app; orbyva@gmail.com)";

async function searchSpotify(
  query: string,
  supabaseUrl: string,
  authHeader: string
): Promise<AlbumCandidate[] | null> {
  const clientId = (Deno.env.get("SPOTIFY_CLIENT_ID") ?? "").trim();
  const clientSecret = (Deno.env.get("SPOTIFY_CLIENT_SECRET") ?? "").trim();
  if (!clientId || !clientSecret) return null;

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/spotify-catalog`, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "search", query }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      albums?: Array<{
        id: string;
        title: string;
        artists: string[];
        release_year: number | null;
        album_type: AlbumType;
        cover_url: string | null;
      }>;
    };
    return (data.albums ?? []).map((a) => ({
      id: a.id,
      source: "spotify" as const,
      title: a.title,
      artists: a.artists,
      release_year: a.release_year,
      album_type: a.album_type,
      cover_url: a.cover_url,
    }));
  } catch {
    return null;
  }
}

type MbArtistCredit = { name?: string; artist?: { name?: string } };
type MbReleaseGroup = {
  id: string;
  title?: string;
  "primary-type"?: string;
  "secondary-types"?: string[];
  "first-release-date"?: string;
  "artist-credit"?: MbArtistCredit[];
};

function artistsFromCredit(credit?: MbArtistCredit[]): string[] {
  return (credit ?? [])
    .map((c) => c.name || c.artist?.name || "")
    .map((n) => n.trim())
    .filter(Boolean);
}

function mapAlbumType(primary?: string, secondary?: string[]): AlbumType {
  const sec = (secondary ?? []).map((s) => s.toLowerCase());
  if (sec.includes("compilation")) return "compilation";
  const p = (primary ?? "").toLowerCase();
  if (p === "album" || p === "ep" || p === "single") return p as AlbumType;
  return "other";
}

function yearFromDate(date?: string): number | null {
  if (!date) return null;
  const y = Number(date.slice(0, 4));
  return Number.isFinite(y) && y > 0 ? y : null;
}

async function searchMusicBrainz(query: string): Promise<AlbumCandidate[]> {
  const url = new URL(`${MB_API}/release-group`);
  url.searchParams.set("query", query);
  url.searchParams.set("fmt", "json");
  url.searchParams.set("limit", "8");
  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { "release-groups"?: MbReleaseGroup[] };
  return (data["release-groups"] ?? [])
    .filter((rg) => rg.id && rg.title?.trim())
    .map((rg) => ({
      id: rg.id,
      source: "musicbrainz" as const,
      title: rg.title!.trim(),
      artists: artistsFromCredit(rg["artist-credit"]),
      release_year: yearFromDate(rg["first-release-date"]),
      album_type: mapAlbumType(rg["primary-type"], rg["secondary-types"]),
      cover_url: `${CAA}/release-group/${rg.id}/front-250`,
    }));
}

/** Busca (Spotify primeiro, MusicBrainz de fallback). */
export async function searchAlbums(
  query: string,
  supabaseUrl: string,
  authHeader: string
): Promise<AlbumCandidate[]> {
  const q = query.trim();
  if (!q) return [];
  const spotify = await searchSpotify(q, supabaseUrl, authHeader);
  if (spotify && spotify.length > 0) return spotify;
  try {
    return await searchMusicBrainz(q);
  } catch {
    return [];
  }
}

async function detailSpotify(
  id: string,
  supabaseUrl: string,
  authHeader: string
): Promise<AlbumCandidate | null> {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/spotify-catalog`, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "album", id }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      album: {
        id: string;
        title: string;
        artists: string[];
        release_year: number | null;
        album_type: AlbumType;
        cover_url: string | null;
      } | null;
    };
    if (!data.album) return null;
    return { ...data.album, source: "spotify" };
  } catch {
    return null;
  }
}

async function detailMusicBrainz(id: string): Promise<AlbumCandidate | null> {
  const url = new URL(`${MB_API}/release-group/${id}`);
  url.searchParams.set("fmt", "json");
  url.searchParams.set("inc", "artist-credits");
  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
  });
  if (!res.ok) return null;
  const rg = (await res.json()) as MbReleaseGroup;
  if (!rg.id || !rg.title?.trim()) return null;
  return {
    id: rg.id,
    source: "musicbrainz",
    title: rg.title.trim(),
    artists: artistsFromCredit(rg["artist-credit"]),
    release_year: yearFromDate(rg["first-release-date"]),
    album_type: mapAlbumType(rg["primary-type"], rg["secondary-types"]),
    cover_url: `${CAA}/release-group/${rg.id}/front-250`,
  };
}

/** Detalhe canônico por id+source — nunca confia no que o LLM ecoou de volta. */
export async function resolveAlbumDetail(
  id: string,
  source: "spotify" | "musicbrainz",
  supabaseUrl: string,
  authHeader: string
): Promise<AlbumCandidate | null> {
  if (source === "spotify") return detailSpotify(id, supabaseUrl, authHeader);
  try {
    return await detailMusicBrainz(id);
  } catch {
    return null;
  }
}
