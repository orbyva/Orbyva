import { createAlbum } from "@/api/albums";
import { createBook } from "@/api/books";
import { createMovie, fetchMovieById } from "@/api/movies";
import { createPlace } from "@/api/places";
import { fetchCinemaByImdbId, searchCinema, fetchCinemaDetails } from "@/lib/cinema";
import {
  fetchGoogleBookById,
  searchGoogleBooks,
} from "@/lib/googleBooks";
import {
  catalogCoverUrl,
  fetchCatalogAlbumMeta,
  searchAlbums,
} from "@/lib/musicCatalog";
import {
  classifyPage,
  enrichFromUrl,
  pageKindLabel,
  type ExtractedPage,
  type PageKind,
} from "@/domain/extension/pageContext";
import { MovieStatus } from "@/types/movies";
import type { PlaceType } from "@/types/places";

export type CaptureResult = {
  kind: PageKind;
  label: string;
};

function cleanTitle(title: string): string {
  return title
    .replace(/\s*[·|•]\s*Letterboxd.*$/i, "")
    .replace(/\s*\(\d{4}\)\s*$/, "")
    .replace(/\s*[-–—]\s*(IMDb|Netflix|Prime Video|Google Maps|Tripadvisor|Booking\.com|Airbnb).*$/i, "")
    .replace(/\s*\|\s*.*$/, "")
    .trim();
}

function placeTypeFor(url: string): PlaceType {
  const host = (() => {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return "";
    }
  })();
  if (host.includes("booking.") || host.includes("airbnb.")) return "hotel";
  if (host.includes("tripadvisor")) return "attraction";
  return "other";
}

async function saveMovie(page: ExtractedPage): Promise<void> {
  const imdb = page.imdbId;
  if (imdb) {
    const existing = await fetchMovieById(imdb);
    if (existing) {
      throw new Error("Esse título já está na sua lista.");
    }
    const movie = await fetchCinemaByImdbId(imdb);
    if (!movie) throw new Error("Não achei esse título no catálogo.");
    await createMovie({
      ...movie,
      status: MovieStatus.TO_WATCH,
      rating: null,
      notes: null,
      would_recommend: true,
      watched_dates: [],
    });
    return;
  }

  const query = cleanTitle(page.title);
  if (!query) throw new Error("Sem título para buscar no cinema.");
  const hits = await searchCinema(query);
  const hit = hits[0];
  if (!hit) throw new Error("Nenhum filme ou série encontrado com esse nome.");
  const movie = await fetchCinemaDetails(hit);
  if (!movie) throw new Error("Falha ao buscar detalhes do título.");
  const existing = await fetchMovieById(movie.imdb_id);
  if (existing) throw new Error("Esse título já está na sua lista.");
  await createMovie({
    ...movie,
    status: MovieStatus.TO_WATCH,
    rating: null,
    notes: null,
    would_recommend: true,
    watched_dates: [],
  });
}

async function saveBook(page: ExtractedPage): Promise<void> {
  if (page.googleBookId) {
    const full = await fetchGoogleBookById(page.googleBookId);
    if (!full) throw new Error("Não achei esse livro no catálogo.");
    await createBook({
      ...full,
      status: "to_read",
      rating: null,
      notes: null,
      would_recommend: true,
      read_dates: [],
    });
    return;
  }
  const query = page.isbn || cleanTitle(page.title);
  if (!query) throw new Error("Sem título ou ISBN para buscar o livro.");
  const hits = await searchGoogleBooks(query);
  const hit = hits[0];
  if (!hit) throw new Error("Nenhum livro encontrado com esse nome.");
  const full = await fetchGoogleBookById(hit.google_id);
  if (!full) throw new Error("Falha ao buscar detalhes do livro.");
  await createBook({
    ...full,
    status: "to_read",
    rating: null,
    notes: null,
    would_recommend: true,
    read_dates: [],
  });
}

async function saveAlbum(page: ExtractedPage): Promise<void> {
  if (page.spotifyAlbumId) {
    const meta = await fetchCatalogAlbumMeta(page.spotifyAlbumId, "spotify");
    if (!meta) throw new Error("Não achei esse álbum no catálogo.");
    await createAlbum({
      musicbrainz_id: meta.musicbrainz_id,
      title: meta.title,
      artists: meta.artists,
      release_year: meta.release_year,
      album_type: meta.album_type,
      cover_url: catalogCoverUrl(meta, "spotify", 500),
      source: "spotify",
      status: "to_listen",
      rating: null,
      notes: null,
      would_recommend: true,
      listened_dates: [],
    });
    return;
  }
  const query = cleanTitle(page.title);
  if (!query) throw new Error("Sem título para buscar o álbum.");
  const { hits, provider } = await searchAlbums(query);
  const hit = hits[0];
  if (!hit) throw new Error("Nenhum álbum encontrado com esse nome.");
  await createAlbum({
    musicbrainz_id: hit.musicbrainz_id,
    title: hit.title,
    artists: hit.artists,
    release_year: hit.release_year,
    album_type: hit.album_type,
    cover_url: catalogCoverUrl(hit, provider, 500),
    source: provider,
    status: "to_listen",
    rating: null,
    notes: null,
    would_recommend: true,
    listened_dates: [],
  });
}

async function savePlace(page: ExtractedPage): Promise<void> {
  const name = cleanTitle(page.title);
  if (!name) throw new Error("Sem nome do lugar nesta página.");
  await createPlace({
    name,
    type: placeTypeFor(page.url),
    status: "to_visit",
    would_recommend: true,
    address: null,
    notes: `Salvo da extensão · ${page.url}`,
  });
}

export async function capturePage(page: ExtractedPage): Promise<CaptureResult> {
  const enriched = enrichFromUrl(page);
  const kind = classifyPage(enriched);
  if (kind === "movie") await saveMovie(enriched);
  else if (kind === "book") await saveBook(enriched);
  else if (kind === "album") await saveAlbum(enriched);
  else if (kind === "place") await savePlace(enriched);
  else {
    throw new Error(
      "Nesta página ainda não dá para salvar. Abra um filme, livro, álbum ou lugar."
    );
  }
  return { kind, label: pageKindLabel(kind) };
}
