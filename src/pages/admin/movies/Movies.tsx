"use client";

import { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { deleteMovie, fetchMovies } from "@/api/movies";
import { Movie } from "@/types/movies";
import { MovieCard } from "./components/MovieCard";
import { MovieSearchModal } from "./components/MovieSearchModal";
import { MovieEditModal } from "./components/MovieEditModal";
import Pagination from "../finance/components/Pagination";
import { useToast } from "@/hooks/use-toast";
import { PAGE_HEADER_ACTIONS_CLASS } from "@/components/FormLabel";

export default function Movies() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState<"to_watch" | "watched">("to_watch");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(36);
  const [totalPages, setTotalPages] = useState(0);

  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const { toast } = useToast();

  const loadMovies = useCallback(async () => {
    const { data, total } = await fetchMovies(filter, page, pageSize);
    setMovies(data);
    setTotalPages(Math.ceil(total / pageSize));
  }, [filter, page, pageSize]);

  useEffect(() => {
    loadMovies();
  }, [loadMovies]);

  async function handleDeleteMovie(imdbId: string) {
    try {
      await deleteMovie(imdbId);

      toast({
        title: "Sucesso",
        description: "Filme excluído com sucesso!",
        duration: 2000,
      });

      await loadMovies();
    } catch (error) {
      toast({
        title: "Erro",
        description: `Falha ao excluir filme: ${error}`,
        variant: "destructive",
        duration: 2000,
      });
    }
  }

  const filteredMovies = movies.filter((movie) =>
    movie.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <main className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 overflow-x-hidden">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Filmes</h1>
          <p className="text-sm text-muted-foreground">
            Organize seus filmes para assistir e os que já foram assistidos.
          </p>
        </div>

        <div className={PAGE_HEADER_ACTIONS_CLASS}>
          <MovieSearchModal onMovieAdded={loadMovies} />
        </div>
      </section>

      <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar filmes..."
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
          }}
          className="w-full sm:w-auto"
        >
          <TabsList className="grid w-full grid-cols-2 sm:w-auto">
            <TabsTrigger value="to_watch">Para Assistir</TabsTrigger>
            <TabsTrigger value="watched">Assistidos</TabsTrigger>
          </TabsList>
        </Tabs>
      </section>

      <section className="rounded-xl border p-4">
        {filteredMovies.length ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 md:grid-cols-4 lg:grid-cols-6">
            {filteredMovies.map((movie) => (
              <MovieCard
                key={movie.imdb_id}
                movie={movie}
                onClick={() => {
                  setSelectedMovie(movie);
                  setIsEditModalOpen(true);
                }}
                onDelete={handleDeleteMovie}
              />
            ))}
          </div>
        ) : (
          <div className="flex min-h-[220px] items-center justify-center text-center text-sm text-muted-foreground">
            Nenhum filme encontrado.
          </div>
        )}
      </section>

      {selectedMovie && (
        <MovieEditModal
          movie={selectedMovie}
          open={isEditModalOpen}
          onOpenChange={setIsEditModalOpen}
          onMovieUpdated={loadMovies}
        />
      )}

      <Pagination
        pageSizes={[6, 12, 36, 60]}
        page={page}
        pageSize={pageSize}
        totalPages={totalPages}
        onSetPage={setPage}
        onSetPageSize={setPageSize}
      />
    </main>
  );
}