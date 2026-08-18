export const EXT_MESSAGE_SOURCE = "orbyva-extension";
export const EXT_APP_SOURCE = "orbyva-ext-app";

export type PageKind =
  | "movie"
  | "book"
  | "album"
  | "place"
  | "product"
  | "unknown";

export type ExtractedPage = {
  url: string;
  title: string;
  description: string | null;
  image: string | null;
  siteName: string | null;
  price: number | null;
  installmentCount: number | null;
  installmentValue: number | null;
  imdbId: string | null;
  isbn: string | null;
  googleBookId: string | null;
  spotifyAlbumId: string | null;
};

export type ExtToAppMessage =
  | { source: typeof EXT_MESSAGE_SOURCE; type: "HELLO" }
  | {
      source: typeof EXT_MESSAGE_SOURCE;
      type: "PAGE_CONTEXT";
      payload: ExtractedPage;
    };

export type AppToExtMessage = {
  source: typeof EXT_APP_SOURCE;
  type: "READY";
};

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function pathnameOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}

export function extractImdbId(url: string): string | null {
  const match = url.match(/\/title\/(tt\d{7,})/i);
  return match?.[1]?.toLowerCase() ?? null;
}

export function extractSpotifyAlbumId(url: string): string | null {
  const match = url.match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?album\/([A-Za-z0-9]+)/i);
  return match?.[1] ?? null;
}

/** ISBN-10/13 em `/dp/` da Amazon ou query `isbn`. */
export function extractIsbnFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const q = parsed.searchParams.get("isbn") ?? parsed.searchParams.get("ISBN");
    if (q && /^\d{9}[\dXx]$|^\d{13}$/.test(q.replace(/-/g, ""))) {
      return q.replace(/-/g, "");
    }
    const dp = parsed.pathname.match(/\/(?:dp|gp\/product)\/(\d{9}[\dXx]|\d{13})(?:[/?]|$)/i);
    return dp?.[1] ?? null;
  } catch {
    return null;
  }
}

export function enrichFromUrl(page: ExtractedPage): ExtractedPage {
  return {
    ...page,
    imdbId: page.imdbId ?? extractImdbId(page.url),
    spotifyAlbumId: page.spotifyAlbumId ?? extractSpotifyAlbumId(page.url),
    isbn: page.isbn ?? extractIsbnFromUrl(page.url),
  };
}

export function classifyPage(page: ExtractedPage): PageKind {
  const host = hostnameOf(page.url);
  const path = pathnameOf(page.url).toLowerCase();
  const enriched = enrichFromUrl(page);

  if (enriched.imdbId) return "movie";
  if (enriched.spotifyAlbumId) return "album";
  if (enriched.isbn || enriched.googleBookId) return "book";

  if (
    host === "imdb.com" ||
    host.endsWith(".imdb.com") ||
    host === "letterboxd.com" ||
    host.endsWith(".letterboxd.com") ||
    host === "themoviedb.org" ||
    host.endsWith(".themoviedb.org") ||
    host === "netflix.com" ||
    host.endsWith(".netflix.com") ||
    host === "primevideo.com" ||
    host.endsWith(".primevideo.com")
  ) {
    return "movie";
  }

  if (
    host === "goodreads.com" ||
    host.endsWith(".goodreads.com") ||
    host === "skoob.com.br" ||
    host.endsWith(".skoob.com.br") ||
    host.startsWith("books.google.") ||
    (host.includes("amazon.") && /\/(books|kindle|gp\/product)/.test(path))
  ) {
    return "book";
  }

  if (
    host === "open.spotify.com" ||
    host === "bandcamp.com" ||
    host.endsWith(".bandcamp.com") ||
    host === "music.apple.com"
  ) {
    return "album";
  }

  if (
    (host === "google.com" && path.startsWith("/maps")) ||
    host === "maps.google.com" ||
    host === "maps.app.goo.gl" ||
    host === "tripadvisor.com" ||
    host.endsWith(".tripadvisor.com") ||
    host === "tripadvisor.com.br" ||
    host.endsWith(".tripadvisor.com.br") ||
    host === "booking.com" ||
    host.endsWith(".booking.com") ||
    host === "airbnb.com" ||
    host.endsWith(".airbnb.com") ||
    host === "airbnb.com.br"
  ) {
    return "place";
  }

  if (
    host.includes("amazon.") ||
    host.includes("mercadolivre.") ||
    host.includes("mercadolibre.") ||
    host.includes("shopee.") ||
    host.includes("magazineluiza.") ||
    host === "magalu.com" ||
    host.endsWith(".magalu.com") ||
    host.includes("americanas.") ||
    host.includes("kabum.")
  ) {
    return "product";
  }

  if (page.price != null && page.price > 0) return "product";

  return "unknown";
}

export function pageKindLabel(kind: PageKind): string {
  if (kind === "movie") return "Cinema";
  if (kind === "book") return "Livros";
  if (kind === "album") return "Música";
  if (kind === "place") return "Lugares";
  if (kind === "product") return "Compra";
  return "Página";
}

export function emptyExtractedPage(): ExtractedPage {
  return {
    url: "",
    title: "",
    description: null,
    image: null,
    siteName: null,
    price: null,
    installmentCount: null,
    installmentValue: null,
    imdbId: null,
    isbn: null,
    googleBookId: null,
    spotifyAlbumId: null,
  };
}

export function isExtMessage(data: unknown): data is ExtToAppMessage {
  if (!data || typeof data !== "object") return false;
  const msg = data as { source?: unknown; type?: unknown };
  return msg.source === EXT_MESSAGE_SOURCE && (msg.type === "HELLO" || msg.type === "PAGE_CONTEXT");
}
