/**
 * MusicBrainz + Cover Art Archive.
 * Docs: https://musicbrainz.org/doc/MusicBrainz_API
 * CAA: https://musicbrainz.org/doc/Cover_Art_Archive/API
 *
 * Usa proxies same-origin (/mb-api, /caa-media) por CORS + User-Agent.
 *
 * Nota de performance: a API do MB costuma levar ~0,7–1,5s (BR).
 * Capas do CAA fazem redirects (~2–3s) — na lista usamos loading=lazy.
 */
import type { AlbumType } from "@/types/music";

const MB_API = "/mb-api/ws/2";
const CAA = "/caa-media";

const USER_AGENT = "Orbyva/1.0 (https://orbyva.app; orbyva@gmail.com)";
const SEARCH_LIMIT = 10;
const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;

export type AlbumSearchHit = {
  musicbrainz_id: string;
  title: string;
  artists: string[];
  release_year: number | null;
  album_type: AlbumType;
  cover_url: string | null;
};

export type AlbumTrack = {
  disc: number;
  position: string;
  title: string;
  lengthMs: number | null;
};

type MbArtistCredit = {
  name?: string;
  artist?: { name?: string };
};

type MbReleaseGroup = {
  id: string;
  title?: string;
  "primary-type"?: string;
  "secondary-types"?: string[];
  "first-release-date"?: string;
  "artist-credit"?: MbArtistCredit[];
};

type MbTrack = {
  number?: string;
  title?: string;
  length?: number | null;
  recording?: { title?: string; length?: number | null };
};

type MbMedium = {
  position?: number;
  tracks?: MbTrack[];
};

type MbRelease = {
  id: string;
  title?: string;
  date?: string;
  status?: string;
  country?: string;
  media?: MbMedium[];
};

const searchCache = new Map<
  string,
  { at: number; hits: AlbumSearchHit[] }
>();

function mbHeaders(): HeadersInit {
  return {
    Accept: "application/json",
    "User-Agent": USER_AGENT,
  };
}

function yearFromDate(date?: string): number | null {
  if (!date) return null;
  const y = Number(date.slice(0, 4));
  return Number.isFinite(y) && y > 0 ? y : null;
}

function mapAlbumType(primary?: string, secondary?: string[]): AlbumType {
  const sec = (secondary ?? []).map((s) => s.toLowerCase());
  if (sec.includes("compilation")) return "compilation";
  const p = (primary ?? "").toLowerCase();
  if (p === "album") return "album";
  if (p === "ep") return "ep";
  if (p === "single") return "single";
  return "other";
}

function artistsFromCredit(credit?: MbArtistCredit[]): string[] {
  if (!credit?.length) return [];
  return credit
    .map((c) => c.name || c.artist?.name || "")
    .map((n) => n.trim())
    .filter(Boolean);
}

/** URL pública do CAA; o proxy resolve redirects. */
export function coverArtUrl(mbid: string, size: 250 | 500 = 500): string {
  return `${CAA}/release-group/${mbid}/front-${size}`;
}

function hitFromGroup(rg: MbReleaseGroup): AlbumSearchHit | null {
  if (!rg.id || !rg.title?.trim()) return null;
  return {
    musicbrainz_id: rg.id,
    title: rg.title.trim(),
    artists: artistsFromCredit(rg["artist-credit"]),
    release_year: yearFromDate(rg["first-release-date"]),
    album_type: mapAlbumType(rg["primary-type"], rg["secondary-types"]),
    cover_url: coverArtUrl(rg.id, 250),
  };
}

function trackCount(release: MbRelease): number {
  return (release.media ?? []).reduce(
    (sum, m) => sum + (m.tracks?.length ?? 0),
    0
  );
}

function pickBestRelease(
  releases: MbRelease[],
  preferredTitle?: string
): MbRelease | null {
  if (!releases.length) return null;
  const preferred = preferredTitle?.trim().toLowerCase();

  const scored = [...releases].map((r) => {
    const status = (r.status ?? "").toLowerCase();
    const title = (r.title ?? "").trim().toLowerCase();
    let score = trackCount(r);
    if (status === "official") score += 1000;
    if (preferred && title === preferred) score += 500;
    else if (preferred && title.includes(preferred)) score += 200;
    if (r.country === "XW" || r.country === "BR") score += 50;
    return { r, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.r ?? null;
}

function tracksFromRelease(release: MbRelease): AlbumTrack[] {
  const out: AlbumTrack[] = [];
  const media = [...(release.media ?? [])].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0)
  );
  for (const medium of media) {
    const disc = medium.position ?? 1;
    for (const track of medium.tracks ?? []) {
      const title =
        track.title?.trim() ||
        track.recording?.title?.trim() ||
        "Faixa sem nome";
      const lengthMs =
        typeof track.length === "number"
          ? track.length
          : typeof track.recording?.length === "number"
            ? track.recording.length
            : null;
      out.push({
        disc,
        position: track.number?.trim() || String(out.length + 1),
        title,
        lengthMs,
      });
    }
  }
  return out;
}

export async function searchMusicBrainz(
  query: string,
  signal?: AbortSignal
): Promise<AlbumSearchHit[]> {
  const q = query.trim();
  if (!q) return [];

  const cacheKey = q.toLowerCase();
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.at < SEARCH_CACHE_TTL_MS) {
    return cached.hits;
  }

  const url = new URL(`${window.location.origin}${MB_API}/release-group`);
  // Filtra no servidor: evita gastar o limit com singles.
  url.searchParams.set(
    "query",
    `(${q}) AND (primarytype:album OR primarytype:ep)`
  );
  url.searchParams.set("fmt", "json");
  url.searchParams.set("limit", String(SEARCH_LIMIT));

  const res = await fetch(url.toString(), {
    headers: mbHeaders(),
    signal,
  });
  if (!res.ok) {
    throw new Error(`Catálogo: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as { "release-groups"?: MbReleaseGroup[] };
  const hits = (data["release-groups"] ?? [])
    .map(hitFromGroup)
    .filter((h): h is AlbumSearchHit => Boolean(h))
    // Orbyva: só álbum/EP — singles (e resto) poluem a lista.
    .filter((h) => h.album_type === "album" || h.album_type === "ep");

  searchCache.set(cacheKey, { at: Date.now(), hits });
  return hits;
}

/** Lookup do release-group — usado em “Atualizar do MusicBrainz”. */
export async function fetchMusicBrainzAlbumMeta(
  releaseGroupId: string,
  signal?: AbortSignal
): Promise<AlbumSearchHit | null> {
  const id = releaseGroupId.trim();
  if (!id || id.startsWith("manual_")) return null;

  const url = new URL(
    `${window.location.origin}${MB_API}/release-group/${encodeURIComponent(id)}`
  );
  url.searchParams.set("fmt", "json");
  url.searchParams.set("inc", "artist-credits");

  const res = await fetch(url.toString(), {
    headers: mbHeaders(),
    signal,
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Catálogo: ${res.status} ${res.statusText}`);
  }

  const rg = (await res.json()) as MbReleaseGroup;
  const hit = hitFromGroup(rg);
  if (!hit) return null;
  return {
    ...hit,
    cover_url: coverArtUrl(hit.musicbrainz_id, 500),
  };
}

/** Tracklist via releases do release-group (1 request). */
export async function fetchMusicBrainzTracklist(
  releaseGroupId: string,
  preferredTitle?: string,
  signal?: AbortSignal
): Promise<AlbumTrack[]> {
  const id = releaseGroupId.trim();
  if (!id || id.startsWith("manual_")) return [];

  const url = new URL(`${window.location.origin}${MB_API}/release`);
  url.searchParams.set("release-group", id);
  url.searchParams.set("inc", "recordings");
  url.searchParams.set("fmt", "json");
  url.searchParams.set("limit", "25");

  const res = await fetch(url.toString(), {
    headers: mbHeaders(),
    signal,
  });
  if (!res.ok) {
    throw new Error(`Catálogo: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as { releases?: MbRelease[] };
  const best = pickBestRelease(data.releases ?? [], preferredTitle);
  if (!best) return [];
  return tracksFromRelease(best);
}
