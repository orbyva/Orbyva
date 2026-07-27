import { useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { deleteMovie, fetchMovies } from "@/api/movies";
import { Movie, MovieTypeFilter } from "@/types/movies";
import { MovieCard } from "./components/MovieCard";
import { MovieSearchModal } from "./components/MovieSearchModal";
import { MovieEditModal } from "./components/MovieEditModal";
import { MovieDetailDialog } from "./components/MovieDetailDialog";
import { MovieShareDialog } from "./components/MovieShareDialog";
import { MovieImportDialog } from "./components/MovieImportDialog";
import Pagination from "../finance/components/Pagination";
import { useToast } from "@/hooks/use-toast";
import { EmptyState } from "@/components/EmptyState";
import { PageShell } from "@/components/PageShell";
import { ModuleGuide, ModuleGuideButton } from "@/components/ModuleGuide";
import { getErrorMessage } from "@/lib/errors";
import {
  collectMovieGenres,
  filterMoviesByGenreAndRating,
  filterMoviesByType,
  formatMovieRating,
  getWatchedMoviesStats,
  type MovieRatingFloor,
} from "@/domain/movies";

export default function Movies() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState<"to_watch" | "watched">("to_watch");
  const [typeFilter, setTypeFilter] = useState<MovieTypeFilter>("all");
  const [genreFilter, setGenreFilter] = useState<string>("all");
  const [ratingFloor, setRatingFloor] = useState<MovieRatingFloor>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(36);
  const [totalPages, setTotalPages] = useState(0);

  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);

  const { toast } = useToast();

  const loadMovies = useCallback(async () => {
    const { data, total } = await fetchMovies(filter, page, pageSize);
    setMovies(data);
    setTotalPages(Math.ceil(total / pageSize));
    setSelectedMovie((current) => {
      if (!current) return current;
      return data.find((m) => m.imdb_id === current.imdb_id) ?? current;
    });
  }, [filter, page, pageSize]);

  useEffect(() => {
    void loadMovies();
  }, [loadMovies]);

  async function handleDeleteMovie(imdbId: string) {
    try {
      await deleteMovie(imdbId);

      toast({
        title: "Sucesso",
        description: "Título excluído com sucesso!",
        duration: 2000,
      });

      await loadMovies();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Falha ao excluir."),
        variant: "destructive",
        duration: 2000,
      });
    }
  }

  const genres = useMemo(() => collectMovieGenres(movies), [movies]);
  const watchedStats = useMemo(() => getWatchedMoviesStats(movies), [movies]);

  const filteredMovies = useMemo(() => {
    const byType = filterMoviesByType(movies, typeFilter);
    const byMeta = filterMoviesByGenreAndRating(byType, {
      genre: genreFilter,
      minRating: filter === "watched" ? ratingFloor : "all",
    });
    const q = searchTerm.trim().toLowerCase();
    if (!q) return byMeta;
    return byMeta.filter((movie) => {
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
  }, [movies, searchTerm, typeFilter, genreFilter, ratingFloor, filter]);

  function openDetail(movie: Movie) {
    setSelectedMovie(movie);
    setIsDetailOpen(true);
  }

  const description =
    filter === "watched" && watchedStats.avgRating != null
      ? `Watchlist, opiniões e histórico · média ${formatMovieRating(watchedStats.avgRating)}/10 em ${watchedStats.rated} título${watchedStats.rated === 1 ? "" : "s"}`
      : "Watchlist, opiniões e histórico.";

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
      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-md">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Buscar título, gênero, elenco, opinião..."
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <Tabs
            value={filter}
            onValueChange={(val) => {
              setFilter(val as "to_watch" | "watched");
              setPage(1);
              setGenreFilter("all");
              setRatingFloor("all");
            }}
            className="w-full sm:w-auto"
          >
            <TabsList className="grid w-full grid-cols-2 sm:w-auto">
              <TabsTrigger value="to_watch">Para Assistir</TabsTrigger>
              <TabsTrigger value="watched">Assistidos</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Tabs
            value={typeFilter}
            onValueChange={(val) => setTypeFilter(val as MovieTypeFilter)}
            className="w-full sm:w-auto"
          >
            <TabsList className="grid w-full grid-cols-3 sm:w-auto">
              <TabsTrigger value="all">Todos</TabsTrigger>
              <TabsTrigger value="movie">Filmes</TabsTrigger>
              <TabsTrigger value="series">Séries</TabsTrigger>
            </TabsList>
          </Tabs>

          <Select value={genreFilter} onValueChange={setGenreFilter}>
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
              onValueChange={(v) => setRatingFloor(v as MovieRatingFloor)}
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
        </div>
      </section>

      <section className="rounded-xl border p-3 sm:p-4">
        {filteredMovies.length ? (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-5 md:grid-cols-4 lg:grid-cols-6">
            {filteredMovies.map((movie) => (
              <MovieCard
                key={movie.imdb_id}
                movie={movie}
                onClick={() => openDetail(movie)}
                onDelete={handleDeleteMovie}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="Nenhum título encontrado"
            description={
              searchTerm || genreFilter !== "all" || ratingFloor !== "all"
                ? "Tente outro filtro ou termo de busca."
                : "Adicione títulos ou importe do Letterboxd / TV Time."
            }
            action={
              searchTerm || genreFilter !== "all" || ratingFloor !== "all" ? (
                undefined
              ) : (
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
            onEdit={() => setIsEditOpen(true)}
            onShare={() => setIsShareOpen(true)}
            onDelete={() => void handleDeleteMovie(selectedMovie.imdb_id)}
            onMoviePatch={(patch) =>
              setSelectedMovie((prev) => (prev ? { ...prev, ...patch } : prev))
            }
          />
          <MovieEditModal
            movie={selectedMovie}
            open={isEditOpen}
            onOpenChange={setIsEditOpen}
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
        totalPages={totalPages}
        onSetPage={setPage}
        onSetPageSize={setPageSize}
      />
    </PageShell>
  );
}
