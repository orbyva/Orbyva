import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { fetchMovieByImdbId, searchMovies } from "@/lib/omdb";
import { createMovie } from "@/api/movies";
import { Movie, MovieCreateRequest, MovieStatus } from "@/types/movies";
import { Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DatePicker } from "@/components/DatePicker";
import {
  FormLabel,
  FORM_DIALOG_CONTENT_CLASS,
  FORM_FIELDS_CLASS,
} from "@/components/FormLabel";

interface MovieSearchModalProps {
  onMovieAdded: () => void;
}

export function MovieSearchModal({ onMovieAdded }: MovieSearchModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<"search" | "details">("search");
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [rating, setRating] = useState<number | "">("");
  const [watchedDate, setWatchedDate] = useState<Date>();
  const [formError, setFormError] = useState("");

  const [status, setStatus] = useState<"watched" | "to_watch">("to_watch");
  const { toast } = useToast();

  async function handleSearch() {
    if (!query.trim()) {
      setFormError("Digite o IMDb ID ou o título do filme.");
      return;
    }

    setFormError("");
    setLoading(true);

    let results: Movie[] = [];
    if (/^tt\d+$/.test(query)) {
      const movie = await fetchMovieByImdbId(query);
      if (movie) results = [movie];
    } else {
      results = await searchMovies(query);
    }

    setSearchResults(results);
    setLoading(false);
  }

  async function handleSelectMovie(movie: Movie) {
    setLoading(true);
    const fullMovie = await fetchMovieByImdbId(movie.imdb_id);

    if (!fullMovie) {
      setLoading(false);
      toast({
        title: "Erro",
        description: "Falha ao buscar detalhes do filme.",
        variant: "destructive",
        duration: 2000,
      });
      return;
    }

    setSelectedMovie(fullMovie);
    setStep("details");
    setLoading(false);
  }

  async function handleSaveMovie() {
    if (!selectedMovie) return;

    if (status === "watched" && !watchedDate) {
      setFormError("Informe a data em que assistiu o filme.");
      return;
    }

    setFormError("");

    const newMovie: MovieCreateRequest = {
      ...selectedMovie,
      status: status === "watched" ? MovieStatus.WATCHED : MovieStatus.TO_WATCH,
      rating: status === "watched" ? (rating !== "" ? Number(rating) : null) : null,
      watched_dates: status === "watched" && watchedDate ? [watchedDate] : [],
    };

    try {
      await createMovie(newMovie);

      toast({
        title: "Sucesso",
        description: "Filme adicionado com sucesso!",
        duration: 2000,
      });

      resetState();
      setIsOpen(false);
      onMovieAdded();
    } catch (error) {
      toast({
        title: "Erro",
        description: `Falha ao adicionar filme: ${error}`,
        variant: "destructive",
        duration: 2000,
      });
    }
  }

  function resetState() {
    setStep("search");
    setQuery("");
    setSearchResults([]);
    setSelectedMovie(null);
    setRating("");
    setWatchedDate(undefined);
    setStatus("to_watch");
    setFormError("");
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) resetState();
      }}
    >
      <DialogTrigger asChild>
        <Button className="w-full gap-2 sm:w-auto">
          <Plus className="h-4 w-4" />
          Adicionar Filme
        </Button>
      </DialogTrigger>

      <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
        <DialogTitle>
          {step === "search" ? "Buscar Filme" : "Adicionar Filme"}
        </DialogTitle>

        {step === "search" ? (
          <div className={FORM_FIELDS_CLASS}>
            <FormLabel required>Busca</FormLabel>
            <Input
              type="text"
              placeholder="Digite o IMDb ID ou o título..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleSearch()}
            />
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <Button onClick={handleSearch} disabled={loading} className="w-full">
              {loading ? "Buscando..." : "Buscar"}
            </Button>

            {searchResults.length > 0 && (
              <div className="max-h-[55vh] overflow-y-auto space-y-2 sm:max-h-[300px]">
                {searchResults.map((movie) => (
                  <div
                    key={movie.imdb_id}
                    className="flex items-center gap-3 rounded-md p-2 hover:bg-muted/50 cursor-pointer"
                    onClick={() => handleSelectMovie(movie)}
                  >
                    <img
                      src={movie.poster || "/placeholder.svg"}
                      alt={movie.title}
                      className="h-16 w-12 flex-none rounded object-cover sm:h-14 sm:w-10"
                    />
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {movie.title} ({movie.year})
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        IMDB ID: {movie.imdb_id}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-start gap-3 sm:gap-4">
              <img
                src={selectedMovie?.poster || "/placeholder.svg"}
                alt={selectedMovie?.title}
                className="h-20 w-14 flex-none rounded object-cover sm:h-24 sm:w-16"
              />
              <div className="min-w-0">
                <h3 className="truncate text-base font-medium sm:text-lg">
                  {selectedMovie?.title} ({selectedMovie?.year})
                </h3>
                <p className="truncate text-sm text-muted-foreground">
                  {selectedMovie?.imdb_id}
                </p>
              </div>
            </div>

            <div className={FORM_FIELDS_CLASS}>
              <FormLabel required>Status</FormLabel>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant={status === "to_watch" ? "default" : "outline"}
                  onClick={() => setStatus("to_watch")}
                  className="w-full sm:w-auto"
                >
                  Para Assistir
                </Button>
                <Button
                  type="button"
                  variant={status === "watched" ? "default" : "outline"}
                  onClick={() => setStatus("watched")}
                  className="w-full sm:w-auto"
                >
                  Assistido
                </Button>
              </div>

              {status === "watched" && (
                <>
                  <FormLabel optional>Nota</FormLabel>
                  <Input
                    type="number"
                    placeholder="Nota de 0 a 10"
                    min="0"
                    max="10"
                    value={rating}
                    onChange={(e) =>
                      setRating(e.target.value ? Number(e.target.value) : "")
                    }
                  />

                  <FormLabel required>Data assistida</FormLabel>
                  <DatePicker date={watchedDate} onSelect={setWatchedDate} />
                </>
              )}

              {formError && <p className="text-sm text-destructive">{formError}</p>}

              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button
                  variant="outline"
                  className="w-full sm:flex-1"
                  onClick={() => setStep("search")}
                >
                  Voltar
                </Button>
                <Button
                  onClick={handleSaveMovie}
                  disabled={loading}
                  className="w-full sm:flex-1"
                >
                  {loading ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
