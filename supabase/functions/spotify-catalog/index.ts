/**
 * Proxy autenticado do catálogo Spotify (Client Credentials).
 * Ações: { action: "search", query } | { action: "album", id }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeadersForRequest } from "../_shared/cors.ts";

const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_API = "https://api.spotify.com/v1";

type TokenCache = { accessToken: string; expiresAt: number };
let tokenCache: TokenCache | null = null;

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeadersForRequest(req),
      "Content-Type": "application/json",
    },
  });
}

async function getAccessToken(
  clientId: string,
  clientSecret: string
): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 5_000) {
    return tokenCache.accessToken;
  }

  const basic = btoa(`${clientId}:${clientSecret}`);
  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Spotify token: ${res.status} ${text}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  tokenCache = {
    accessToken: data.access_token,
    expiresAt: now + Math.max(60, data.expires_in - 60) * 1000,
  };
  return data.access_token;
}

async function spotifyGet(
  path: string,
  token: string,
  params?: Record<string, string>
): Promise<Response> {
  const url = new URL(`${SPOTIFY_API}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  return fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
}

type SpotifyImage = { url?: string; width?: number; height?: number };
type SpotifyArtist = { name?: string };
type SpotifyAlbumSimplified = {
  id?: string;
  name?: string;
  album_type?: string;
  album_group?: string;
  release_date?: string;
  total_tracks?: number;
  images?: SpotifyImage[];
  artists?: SpotifyArtist[];
};

type SpotifyTrack = {
  id?: string;
  name?: string;
  track_number?: number;
  disc_number?: number;
  duration_ms?: number;
};

function yearFromReleaseDate(date?: string): number | null {
  if (!date) return null;
  const y = Number(date.slice(0, 4));
  return Number.isFinite(y) && y > 0 ? y : null;
}

function mapAlbumType(
  raw?: string
): "album" | "ep" | "single" | "compilation" | "other" {
  const t = (raw ?? "").toLowerCase();
  if (t === "album") return "album";
  if (t === "ep") return "ep";
  if (t === "single") return "single";
  if (t === "compilation") return "compilation";
  return "other";
}

function pickCover(images?: SpotifyImage[]): string | null {
  if (!images?.length) return null;
  const sorted = [...images].sort(
    (a, b) => (b.width ?? 0) - (a.width ?? 0)
  );
  return sorted[0]?.url ?? null;
}

function isAlbumOrEp(album: SpotifyAlbumSimplified): boolean {
  const group = (album.album_group ?? album.album_type ?? "").toLowerCase();
  return group === "album" || group === "ep";
}

function serializeAlbum(album: SpotifyAlbumSimplified) {
  if (!album.id || !album.name?.trim()) return null;
  const albumType = mapAlbumType(album.album_type ?? album.album_group);
  return {
    id: album.id,
    title: album.name.trim(),
    artists: (album.artists ?? [])
      .map((a) => a.name?.trim() ?? "")
      .filter(Boolean),
    release_year: yearFromReleaseDate(album.release_date),
    album_type: albumType,
    cover_url: pickCover(album.images),
    total_tracks: album.total_tracks ?? null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeadersForRequest(req) });
  }

  try {
    if (req.method !== "POST") {
      return json(req, { error: "Method not allowed" }, 405);
    }

    const clientId = (Deno.env.get("SPOTIFY_CLIENT_ID") ?? "").trim();
    const clientSecret = (Deno.env.get("SPOTIFY_CLIENT_SECRET") ?? "").trim();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    if (!clientId || !clientSecret) {
      return json(
        req,
        {
          error: "Spotify não configurado",
          code: "SPOTIFY_NOT_CONFIGURED",
        },
        503
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(req, { error: "Não autenticado" }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) {
      return json(req, { error: "Não autenticado" }, 401);
    }

    const body = (await req.json().catch(() => ({}))) as {
      action?: string;
      query?: string;
      id?: string;
    };

    const token = await getAccessToken(clientId, clientSecret);

    if (body.action === "search") {
      const query = (body.query ?? "").trim();
      if (!query) return json(req, { albums: [] });

      const res = await spotifyGet("/search", token, {
        q: query,
        type: "album",
        limit: "10",
        market: "BR",
      });

      if (!res.ok) {
        const text = await res.text();
        return json(
          req,
          { error: `Spotify search: ${res.status}`, detail: text },
          res.status === 429 ? 429 : 502
        );
      }

      const data = (await res.json()) as {
        albums?: { items?: SpotifyAlbumSimplified[] };
      };
      const albums = (data.albums?.items ?? [])
        .filter(isAlbumOrEp)
        .map(serializeAlbum)
        .filter(Boolean);

      return json(req, { albums });
    }

    if (body.action === "album") {
      const id = (body.id ?? "").trim();
      if (!id) return json(req, { error: "id obrigatório" }, 400);

      const res = await spotifyGet(`/albums/${encodeURIComponent(id)}`, token, {
        market: "BR",
      });
      if (res.status === 404) return json(req, { album: null }, 404);
      if (!res.ok) {
        const text = await res.text();
        return json(
          req,
          { error: `Spotify album: ${res.status}`, detail: text },
          res.status === 429 ? 429 : 502
        );
      }

      const album = (await res.json()) as SpotifyAlbumSimplified & {
        tracks?: {
          items?: SpotifyTrack[];
          next?: string | null;
          total?: number;
        };
      };

      const meta = serializeAlbum(album);
      if (!meta) return json(req, { album: null }, 404);

      const tracks: Array<{
        disc: number;
        position: string;
        title: string;
        lengthMs: number | null;
      }> = [];

      const pushItems = (items: SpotifyTrack[] | undefined) => {
        for (const t of items ?? []) {
          tracks.push({
            disc: t.disc_number ?? 1,
            position: String(t.track_number ?? tracks.length + 1),
            title: t.name?.trim() || "Faixa sem nome",
            lengthMs:
              typeof t.duration_ms === "number" ? t.duration_ms : null,
          });
        }
      };

      pushItems(album.tracks?.items);

      let nextUrl = album.tracks?.next ?? null;
      while (nextUrl) {
        const pageRes = await fetch(nextUrl, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        });
        if (!pageRes.ok) break;
        const page = (await pageRes.json()) as {
          items?: SpotifyTrack[];
          next?: string | null;
        };
        pushItems(page.items);
        nextUrl = page.next ?? null;
      }

      tracks.sort(
        (a, b) =>
          a.disc - b.disc ||
          Number(a.position) - Number(b.position) ||
          a.position.localeCompare(b.position, "en", { numeric: true })
      );

      return json(req, { album: { ...meta, tracks } });
    }

    return json(req, { error: "action inválida" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json(req, { error: message }, 500);
  }
});
