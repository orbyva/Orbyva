import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpDown, Heart, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { deleteMovie, fetchAllMovies, updateMovie } from "@/api/movies";
import { fetchWatchedEpisodeCounts } from "@/api/movieEpisodes";
import { Movie, MovieListFilter, MovieTypeFilter } from "@/types/movies";
import { MovieCard } from "./components/MovieCard";
import { MovieSearchModal } from "./components/MovieSearchModal";
import { MovieEditModal, type MovieEditIntent } from "./components/MovieEditModal";
import { MovieDetailDialog } from "./components/MovieDetailDialog";
import { MovieShareDialog } from "./components/MovieShareDialog";
import { MovieImportDialog } from "./components/MovieImportDialog";
import Pagination from "../finance/components/Pagination";
import { useToast } from "@/hooks/use-toast";
import { EmptyState } from "@/components/EmptyState";
import { PageShell } from "@/components/PageShell";
import { EntertainmentInsightsStrip } from "@/components/EntertainmentInsightsStrip";
import { ModuleGuide, ModuleGuideButton } from "@/components/ModuleGuide";
import { getErrorMessage } from "@/lib/errors";
import { createMemoryCache } from "@/lib/memoryCache";
import { useCachedCatalog } from "@/hooks/useCachedCatalog";
import {
  collectMovieGenres,
  filterMoviesByGenreAndRating,
  filterMoviesByType,
  formatMovieRating,
  getCinemaLibraryStats,
  pickRandomToWatchMovie,
  type MovieRatingFloor,
} from "@/domain/movies";
import {
  CATALOG_SORT_OPTIONS,
  sortMovies,
  type CatalogSort,
} from "@/domain/entertainment/sort";
import { cn } from "@/lib/utils";

const moviesCatalogCache = createMemoryCache<Movie[]>();

export default function Movies() {
  const fetchAll = useCallback(() => fetchAllMovies(), []);
  const { items: allMovies, reload, replace } = useCachedCatalog(
    moviesCatalogCache,
    fetchAll
  );

  const [watchedEpisodeCounts, setWatchedEpisodeCounts] = useState<
    Record<string, number>
  >({});
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState<MovieListFilter>("to_watch");
  const [typeFilter, setTypeFilter] = useState<MovieTypeFilter>("all");
  const [genreFilter, setGenreFilter] = useState<string>("all");
  const [ratingFloor, setRatingFloor] = useState<MovieRatingFloor>("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [sort, setSort] = useState<CatalogSort>("default");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(36);

  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editIntent, setEditIntent] = useState<MovieEditIntent | null>(null);
  const [isShareOpen, setIsShareOpen] = useState(false);

  const { toast } = useToast();

  const loadMovies = useCallback(() => reload(true), [reload]);

  const statusMovies = useMemo(
    () => allMovies.filter((m) => m.status === filter),
    [allMovies, filter]
  );

  const genres = useMemo(
    () => collectMovieGenres(statusMovies),
    [statusMovies]
  );
  const libraryStats = useMemo(
    () => getCinemaLibraryStats(allMovies),
    [allMovies]
  );

  const insightStats = useMemo(
    () => [
      { label: "assistidos", value: libraryStats.watched },
      { label: "este ano", value: libraryStats.thisYear },
      { label: "na lista", value: libraryStats.toWatch },
      { label: "favoritos", value: libraryStats.favorites },
    ],
    [libraryStats]
  );

  const filteredMovies = useMemo(() => {
    const byType = filterMoviesByType(statusMovies, typeFilter);
    const byMeta = filterMoviesByGenreAndRating(byType, {
      genre: genreFilter,
      minRating: filter === "watched" ? ratingFloor : "all",
    });
    const q = searchTerm.trim().toLowerCase();
    const searched = !q
      ? byMeta
      : byMeta.filter((movie) => {
          const haystack = [
            movie.title,
            movie.notes,
            movie.director,
            ...(movie.genre ?? []),
            ...(movie.actors ?? []),
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return haystack.includes(q);
        });
    const byFavorite = favoritesOnly
      ? searched.filter((m) => m.is_favorite === true)
      : searched;
    return sortMovies(byFavorite, sort, filter);
  }, [
    statusMovies,
    searchTerm,
    typeFilter,
    genreFilter,
    ratingFloor,
    favoritesOnly,
    filter,
    sort,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredMovies.length / pageSize));
  const pageMovies = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredMovies.slice(start, start + pageSize);
  }, [filteredMovies, page, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    setSelectedMovie((current) => {
      if (!current) return current;
      return allMovies.find((m) => m.imdb_id === current.imdb_id) ?? current;
    });
  }, [allMovies]);

  useEffect(() => {
    const seriesIds = pageMovies
      .filter((m) => m.type === "series")
      .map((m) => m.imdb_id);
    if (seriesIds.length === 0) {
      setWatchedEpisodeCounts({});
      return;
    }
    let cancelled = false;
    void fetchWatchedEpisodeCounts(seriesIds)
      .then((counts) => {
        if (!cancelled) setWatchedEpisodeCounts(counts);
      })
      .catch(() => {
        if (!cancelled) setWatchedEpisodeCounts({});
      });
    return () => {
      cancelled = true;
    };
  }, [pageMovies]);

  async function handleDeleteMovie(imdbId: string) {
    try {
      await deleteMovie(imdbId);
      replace((prev) => prev.filter((m) => m.imdb_id !== imdbId));
      toast({
        title: "Sucesso",
        description: "Título excluído com sucesso!",
        duration: 2000,
      });
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Falha ao excluir."),
        variant: "destructive",
        duration: 2000,
      });
    }
  }

  async function handleToggleFavorite(imdbId: string, next: boolean) {
    const previous = allMovies.find((m) => m.imdb_id === imdbId)?.is_favorite;
    replace((prev) =>
      prev.map((m) =>
        m.imdb_id === imdbId ? { ...m, is_favorite: next } : m
      )
    );
    setSelectedMovie((cur) =>
      cur?.imdb_id === imdbId ? { ...cur, is_favorite: next } : cur
    );
    try {
      await updateMovie({ imdb_id: imdbId, is_favorite: next });
    } catch (error) {
      replace((prev) =>
        prev.map((m) =>
          m.imdb_id === imdbId
            ? { ...m, is_favorite: previous === true }
            : m
        )
      );
      setSelectedMovie((cur) =>
        cur?.imdb_id === imdbId
          ? { ...cur, is_favorite: previous === true }
          : cur
      );
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Falha ao atualizar favorito."),
        variant: "destructive",
      });
    }
  }

  function openDetail(movie: Movie) {
    setSelectedMovie(movie);
    setIsDetailOpen(true);
  }

  function handleSurprise() {
    const pick = pickRandomToWatchMovie(allMovies);
    if (!pick) {
      toast({
        title: "Lista vazia",
        description: "Adicione títulos em Para assistir para surpreender.",
        duration: 2500,
      });
      return;
    }
    openDetail(pick);
  }

  const description =
    libraryStats.avgRating != null
      ? `Watchlist, opiniões e histórico · média ${formatMovieRating(libraryStats.avgRating)}/10 em ${libraryStats.rated} título${libraryStats.rated === 1 ? "" : "s"}`
      : "Watchlist, opiniões e histórico.";

  const hasClientFilters =
    searchTerm ||
    genreFilter !== "all" ||
    ratingFloor !== "all" ||
    favoritesOnly;

  return (
    <PageShell
      title="Cinema"
      description={description}
      actions={
        <>
          <ModuleGuideButton moduleId="movies" />
          <MovieImportDialog onImported={loadMovies} />
          <MovieSearchModal onMovieAdded={loadMovies} />
        </>
      }
    >
      <ModuleGuide moduleId="movies" />
      <EntertainmentInsightsStrip
        stats={insightStats}
        onSurprise={handleSurprise}
      />
      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-md">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Buscar título, gênero, elenco, opinião..."
              className="pl-9"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <Tabs
            value={filter}
            onValueChange={(val) => {
              setFilter(val as MovieListFilter);
              setPage(1);
              setGenreFilter("all");
              setRatingFloor("all");
            }}
            className="w-full sm:w-auto"
          >
            <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4 sm:w-auto">
              <TabsTrigger value="to_watch">Para assistir</TabsTrigger>
              <TabsTrigger value="watching">Assistindo</TabsTrigger>
              <TabsTrigger value="watched">Assistidos</TabsTrigger>
              <TabsTrigger value="abandoned">Abandonei</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Tabs
            value={typeFilter}
            onValueChange={(val) => {
              setTypeFilter(val as MovieTypeFilter);
              setPage(1);
            }}
            className="w-full sm:w-auto"
          >
            <TabsList className="grid w-full grid-cols-3 sm:w-auto">
              <TabsTrigger value="all">Todos</TabsTrigger>
              <TabsTrigger value="movie">Filmes</TabsTrigger>
              <TabsTrigger value="series">Séries</TabsTrigger>
            </TabsList>
          </Tabs>

          <Select
            value={genreFilter}
            onValueChange={(v) => {
              setGenreFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Gênero" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os gêneros</SelectItem>
              {genres.map((g) => (
                <SelectItem key={g} value={g}>
                  {g}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {filter === "watched" ? (
            <Select
              value={ratingFloor}
              onValueChange={(v) => {
                setRatingFloor(v as MovieRatingFloor);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Nota mínima" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Qualquer nota</SelectItem>
                <SelectItem value="6">6+ Bom</SelectItem>
                <SelectItem value="7">7+ Muito bom</SelectItem>
                <SelectItem value="8">8+ Excelente</SelectItem>
                <SelectItem value="9">9+ Obra-prima</SelectItem>
              </SelectContent>
            </Select>
          ) : null}

          <Button
            type="button"
            variant={favoritesOnly ? "default" : "outline"}
            className="w-full sm:w-auto"
            onClick={() => {
              setFavoritesOnly((v) => !v);
              setPage(1);
            }}
            aria-pressed={favoritesOnly}
          >
            <Heart
              className={cn(
                "mr-2 h-4 w-4",
                favoritesOnly && "fill-current"
              )}
            />
            Favoritos
          </Button>
        </div>
      </section>

      <section className="rounded-xl border p-3 sm:p-4">
        <div className="mb-3 flex flex-col gap-2 sm:mb-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {filteredMovies.length === 1
              ? "1 item"
              : `${filteredMovies.length} itens`}
          </p>
          <Select
            value={sort}
            onValueChange={(v) => {
              setSort(v as CatalogSort);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-[220px]" aria-label="Ordenar">
              <ArrowUpDown className="mr-2 h-4 w-4 shrink-0 opacity-60" />
              <SelectValue placeholder="Ordenar" />
            </SelectTrigger>
            <SelectContent>
              {CATALOG_SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {pageMovies.length ? (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-5 md:grid-cols-4 lg:grid-cols-6">
            {pageMovies.map((movie) => (
              <MovieCard
                key={movie.imdb_id}
                movie={movie}
                watchedEpisodes={watchedEpisodeCounts[movie.imdb_id]}
                onClick={() => openDetail(movie)}
                onDelete={handleDeleteMovie}
                onToggleFavorite={handleToggleFavorite}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="Nenhum título encontrado"
            description={
              hasClientFilters
                ? "Tente outro filtro ou termo de busca."
                : "Adicione títulos ou importe uma lista em CSV."
            }
            action={
              hasClientFilters ? undefined : (
                <div className="flex flex-wrap justify-center gap-2">
                  <MovieSearchModal onMovieAdded={loadMovies} />
                  <MovieImportDialog onImported={loadMovies} />
                </div>
              )
            }
          />
        )}
      </section>

      {selectedMovie && (
        <>
          <MovieDetailDialog
            movie={selectedMovie}
            open={isDetailOpen}
            onOpenChange={setIsDetailOpen}
            onEdit={(intent) => {
              setEditIntent(intent ?? null);
              setIsEditOpen(true);
            }}
            onShare={() => setIsShareOpen(true)}
            onDelete={() => void handleDeleteMovie(selectedMovie.imdb_id)}
            onMoviePatch={(patch) => {
              const id = selectedMovie.imdb_id;
              setSelectedMovie((prev) =>
                prev ? { ...prev, ...patch } : prev
              );
              replace((prev) => {
                const idx = prev.findIndex((m) => m.imdb_id === id);
                if (idx >= 0) {
                  return prev.map((m) =>
                    m.imdb_id === id ? { ...m, ...patch } : m
                  );
                }
                return [{ ...selectedMovie, ...patch }, ...prev];
              });
            }}
            onWatchedEpisodesChange={(count) => {
              setWatchedEpisodeCounts((prev) => ({
                ...prev,
                [selectedMovie.imdb_id]: count,
              }));
            }}
          />
          <MovieEditModal
            movie={selectedMovie}
            open={isEditOpen}
            onOpenChange={(open) => {
              setIsEditOpen(open);
              if (!open) setEditIntent(null);
            }}
            initialIntent={editIntent}
            onMovieUpdated={async () => {
              await loadMovies();
            }}
          />
          <MovieShareDialog
            movie={selectedMovie}
            open={isShareOpen}
            onOpenChange={setIsShareOpen}
          />
        </>
      )}

      <Pagination
        pageSizes={[6, 12, 36, 60]}
        page={page}
        pageSize={pageSize}
        totalPages={filteredMovies.length === 0 ? 0 : totalPages}
        onSetPage={setPage}
        onSetPageSize={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />
    </PageShell>
  );
}
