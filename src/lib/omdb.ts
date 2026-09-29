import { Movie, MovieStatus } from "@/types/movies";

const API_URL = "https://www.omdbapi.com/";
const API_KEY = import.meta.env.VITE_OMDB_API_KEY;

interface OmdbSearchResult {
  imdbID: string;
  Title: string;
  Year: string;
  Poster: string;
  Type: "movie" | "series";
}

interface OmdbSearchResponse {
  Search?: OmdbSearchResult[];
  Response: "True" | "False";
  Error?: string;
}

interface OmdbMovieResponse extends OmdbSearchResult {
  Genre?: string;
  Director?: string;
  Actors?: string;
  Plot?: string;
  imdbRating?: string;
}

// Fetch movie by IMDb ID
export async function fetchMovieByImdbId(imdbId: string): Promise<Movie | null> {
  try {
    const res = await fetch(`${API_URL}?i=${imdbId}&apikey=${API_KEY}`);
    const movie = (await res.json()) as OmdbMovieResponse & {
      Response?: "True" | "False";
    };

    if (movie.Response === "False") return null;

    return formatMovie(movie);
  } catch (error) {
    console.error("Error fetching movie by IMDb ID:", error);
    return null;
  }
}

// Search movies by title
export async function searchMovies(query: string): Promise<Movie[]> {
  try {
    const res = await fetch(
      `${API_URL}?s=${encodeURIComponent(query)}&apikey=${API_KEY}`
    );
    const searchResults = (await res.json()) as OmdbSearchResponse;

    if (!searchResults.Search) return [];

    return searchResults.Search.map((result) => ({
      imdb_id: result.imdbID,
      title: result.Title,
      year: parseInt(result.Year, 10),
      poster: result.Poster !== "N/A" ? result.Poster : null,
      genre: [],
      director: null,
      actors: [],
      plot: null,
      type: result.Type as "movie" | "series",
      rating: null,
      score_imdb: null,
      watched_dates: [],
      notes: null,
      would_recommend: true,
      status: MovieStatus.TO_WATCH,
    }));
  } catch (error) {
    console.error("Error searching movies:", error);
    return [];
  }
}

// Format API response to match Movie type
function formatMovie(movie: OmdbMovieResponse): Movie {
  const actors = movie.Actors && movie.Actors !== "N/A"
    ? movie.Actors.split(", ")
    : [];

  return {
    imdb_id: movie.imdbID,
    title: movie.Title,
    year: parseInt(movie.Year, 10),
    poster: movie.Poster !== "N/A" ? movie.Poster : null,
    genre: movie.Genre ? movie.Genre.split(", ").filter(Boolean) : [],
    director: movie.Director !== "N/A" ? movie.Director : null,
    actors,
    plot: movie.Plot !== "N/A" ? movie.Plot : null,
    type: movie.Type as "movie" | "series",
    rating: null,
    score_imdb: movie.imdbRating && movie.imdbRating !== "N/A"
      ? parseFloat(movie.imdbRating)
      : null,
    status: MovieStatus.TO_WATCH,
    watched_dates: [],
    notes: null,
    would_recommend: true,
  };
}

/** Pick best OMDb search hit for a title (+ optional year). */
export async function findMovieByTitleYear(
  title: string,
  year?: number | null
): Promise<Movie | null> {
  const results = await searchMovies(title);
  if (!results.length) return null;

  const normalized = title.trim().toLowerCase();
  const exact = results.find(
    (r) =>
      r.title.toLowerCase() === normalized &&
      (year == null || r.year === year)
  );
  if (exact) {
    return (await fetchMovieByImdbId(exact.imdb_id)) ?? exact;
  }

  const yearMatch = year
    ? results.find((r) => r.year === year)
    : undefined;
  const pick = yearMatch ?? results[0];
  return (await fetchMovieByImdbId(pick.imdb_id)) ?? pick;
}

/** Like findMovieByTitleYear, but prefers OMDb hits with type === "series". */
export async function findSeriesByTitleYear(
  title: string,
  year?: number | null
): Promise<Movie | null> {
  const results = await searchMovies(title);
  if (!results.length) return null;

  const series = results.filter((r) => r.type === "series");
  const pool = series.length > 0 ? series : results;
  const normalized = title.trim().toLowerCase();
  const exact = pool.find(
    (r) =>
      r.title.toLowerCase() === normalized &&
      (year == null || r.year === year)
  );
  if (exact) {
    const full = (await fetchMovieByImdbId(exact.imdb_id)) ?? exact;
    return { ...full, type: "series" };
  }

  const yearMatch = year ? pool.find((r) => r.year === year) : undefined;
  const pick = yearMatch ?? pool[0];
  const full = (await fetchMovieByImdbId(pick.imdb_id)) ?? pick;
  return { ...full, type: "series" };
}
