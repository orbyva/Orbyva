import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  fetchCinemaByImdbId,
  fetchCinemaDetails,
  isTmdbConfigured,
  searchCinema,
  type CinemaSearchHit,
} from "@/lib/cinema";
import { createMovie } from "@/api/movies";
import { Movie, MovieCreateRequest, MovieStatus } from "@/types/movies";
import { Loader2, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DatePicker } from "@/components/DatePicker";
import { ScoreRating } from "@/components/ScoreRating";
import {
  FormLabel,
  FORM_DIALOG_CONTENT_CLASS,
  FORM_FIELDS_CLASS,
} from "@/components/FormLabel";
import { formatMovieRating, getMovieRatingLabel } from "@/domain/movies";
import { formatLocalIsoDate } from "@/domain/entertainment/insights";
import { getErrorMessage } from "@/lib/errors";
import {
  isAbortError,
  useTypeaheadSearch,
} from "@/hooks/useTypeaheadSearch";

interface MovieSearchModalProps {
  onMovieAdded: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}

export function MovieSearchModal({
  onMovieAdded,
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
}: MovieSearchModalProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : uncontrolledOpen;

  function setIsOpen(next: boolean) {
    if (!isControlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  }
  const [step, setStep] = useState<"search" | "details">("search");
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CinemaSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [wouldRecommend, setWouldRecommend] = useState(true);
  const [watchedDate, setWatchedDate] = useState<Date>();
  const [formError, setFormError] = useState("");
  const [status, setStatus] = useState<"to_watch" | "watching" | "watched">(
    "to_watch"
  );
  const { toast } = useToast();
  const searchReqId = useRef(0);

  const clearSearchResults = useCallback(() => {
    setSearchResults([]);
    setFormError("");
    setLoading(false);
  }, []);

  const runTypeahead = useCallback(
    async (q: string, signal: AbortSignal) => {
      const reqId = ++searchReqId.current;
      setFormError("");
      setLoading(true);
      try {
        let results: CinemaSearchHit[] = [];
        if (/^tt\d+$/i.test(q)) {
          const movie = await fetchCinemaByImdbId(q);
          if (signal.aborted || reqId !== searchReqId.current) return;
          if (movie) {
            results = [
              {
                tmdb_id: 0,
                media_type: movie.type === "series" ? "tv" : "movie",
                title: movie.title,
                year: movie.year,
                poster: movie.poster ?? null,
                overview: movie.plot,
                imdb_id: movie.imdb_id,
              },
            ];
            setSelectedMovie(movie);
            setSearchResults(results);
            setStep("details");
            return;
          }
        } else {
          results = await searchCinema(q);
        }
        if (signal.aborted || reqId !== searchReqId.current) return;
        setSearchResults(results);
        if (results.length === 0) {
          setFormError(
            isTmdbConfigured()
              ? "Nenhum título encontrado. Tente outro nome."
              : "Busca de cinema temporariamente indisponível. Tente mais tarde."
          );
        }
      } catch (error) {
        if (signal.aborted || isAbortError(error)) return;
        if (reqId !== searchReqId.current) return;
        setSearchResults([]);
        setFormError(getErrorMessage(error, "Falha na busca."));
      } finally {
        if (reqId === searchReqId.current) setLoading(false);
      }
    },
    []
  );

  useTypeaheadSearch({
    query,
    enabled: isOpen && step === "search",
    allowImdbId: true,
    run: runTypeahead,
    onClear: clearSearchResults,
  });

  async function handleSelectMovie(hit: CinemaSearchHit) {
    setLoading(true);
    try {
      const fullMovie = hit.imdb_id && hit.tmdb_id === 0
        ? await fetchCinemaByImdbId(hit.imdb_id)
        : await fetchCinemaDetails(hit);

      if (!fullMovie) {
        toast({
          title: "Erro",
          description: "Falha ao buscar detalhes do título.",
          variant: "destructive",
          duration: 2000,
        });
        return;
      }

      setSelectedMovie(fullMovie);
      setStep("details");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveMovie() {
    if (!selectedMovie) return;

    if (status === "watched" && !watchedDate) {
      setFormError("Informe a data em que assistiu.");
      return;
    }

    setFormError("");

    const newMovie: MovieCreateRequest = {
      ...selectedMovie,
      status:
        status === "watched"
          ? MovieStatus.WATCHED
          : status === "watching"
            ? MovieStatus.WATCHING
            : MovieStatus.TO_WATCH,
      rating: status === "watched" ? rating : null,
      notes: status === "watched" ? notes.trim() || null : null,
      would_recommend: status === "watched" ? wouldRecommend : true,
      watched_dates:
        status === "watched" && watchedDate
          ? [formatLocalIsoDate(watchedDate)]
          : [],
    };

    try {
      await createMovie(newMovie);

      toast({
        title: "Sucesso",
        description: "Adicionado com sucesso!",
        duration: 2000,
      });

      resetState();
      setIsOpen(false);
      onMovieAdded();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Falha ao adicionar."),
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
    setRating(null);
    setNotes("");
    setWouldRecommend(true);
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
      {!hideTrigger ? (
        <DialogTrigger asChild>
          <Button className="w-full gap-2 sm:w-auto">
            <Plus className="h-4 w-4" />
            Adicionar
          </Button>
        </DialogTrigger>
      ) : null}

      <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
        <DialogTitle>
          {step === "search" ? "Buscar título" : "Adicionar à lista"}
        </DialogTitle>

        {step === "search" ? (
          <div className={FORM_FIELDS_CLASS}>
            <FormLabel required>Busca</FormLabel>
            <div className="relative">
              <Input
                type="text"
                placeholder="Digite o título ou IMDb ID…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoComplete="off"
                className={loading ? "pr-9" : undefined}
              />
              {loading ? (
                <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                  <Loader2
                    className="h-4 w-4 animate-spin text-muted-foreground"
                    aria-hidden
                  />
                </div>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              Resultados aparecem conforme você digita.
            </p>
            {formError && <p className="text-sm text-destructive">{formError}</p>}

            {searchResults.length > 0 && (
              <div className="max-h-[55vh] space-y-2 overflow-y-auto sm:max-h-[300px]">
                {searchResults.map((hit) => (
                  <div
                    key={
                      hit.tmdb_id > 0
                        ? `${hit.media_type}-${hit.tmdb_id}`
                        : hit.imdb_id || `${hit.title}-${hit.year}`
                    }
                    className="flex cursor-pointer items-center gap-3 rounded-md p-2 hover:bg-muted/50"
                    onClick={() => handleSelectMovie(hit)}
                  >
                    <img
                      src={hit.poster || "/placeholder.svg"}
                      alt={hit.title}
                      className="h-16 w-12 flex-none rounded object-cover sm:h-14 sm:w-10"
                    />
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {hit.title}
                        {hit.year ? ` (${hit.year})` : ""}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        {hit.media_type === "tv" ? "Série" : "Filme"}
                        {hit.overview ? ` · ${hit.overview}` : ""}
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
                  {selectedMovie?.type === "series" ? "Série" : "Filme"}
                  {selectedMovie?.genre?.length
                    ? ` · ${selectedMovie.genre.slice(0, 3).join(", ")}`
                    : ""}
                </p>
                {selectedMovie?.plot && (
                  <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">
                    {selectedMovie.plot}
                  </p>
                )}
              </div>
            </div>

            <div className={FORM_FIELDS_CLASS}>
              <FormLabel required>Status</FormLabel>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Button
                  type="button"
                  variant={status === "to_watch" ? "default" : "outline"}
                  onClick={() => setStatus("to_watch")}
                  className="w-full sm:w-auto"
                >
                  Para assistir
                </Button>
                <Button
                  type="button"
                  variant={status === "watching" ? "default" : "outline"}
                  onClick={() => setStatus("watching")}
                  className="w-full sm:w-auto"
                >
                  Assistindo
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
                  <div>
                    <FormLabel optional>Nota</FormLabel>
                    <div className="space-y-2">
                      <ScoreRating value={rating} onChange={setRating} />
                      {rating != null && rating > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {formatMovieRating(rating)}/10 —{" "}
                          {getMovieRatingLabel(rating)}
                        </p>
                      )}
                    </div>
                  </div>

                  <FormLabel required>Data assistida</FormLabel>
                  <DatePicker date={watchedDate} onSelect={setWatchedDate} />

                  <div>
                    <FormLabel optional>O que achou?</FormLabel>
                    <textarea
                      className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      placeholder="Sua opinião..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </div>

                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={wouldRecommend}
                      onChange={(e) => setWouldRecommend(e.target.checked)}
                      className="rounded"
                    />
                    Recomendaria
                  </label>
                </>
              )}

              {formError && (
                <p className="text-sm text-destructive">{formError}</p>
              )}

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
                    {loading ? "Salvando…" : "Adicionar à lista"}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
