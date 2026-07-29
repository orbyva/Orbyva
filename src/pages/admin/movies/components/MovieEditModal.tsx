"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { updateMovie } from "@/api/movies";
import { Movie, MovieStatus, MovieUpdateRequest } from "@/types/movies";
import { useToast } from "@/hooks/use-toast";
import { DatePicker } from "@/components/DatePicker";
import { ScoreRating } from "@/components/ScoreRating";
import {
  FormLabel,
  FORM_DIALOG_CONTENT_CLASS,
  FORM_FIELDS_CLASS,
} from "@/components/FormLabel";
import {
  MOVIE_STATUS_LABELS,
  MOVIE_TYPE_LABELS,
  formatMovieRating,
  getMovieRatingLabel,
  normalizeWatchedDates,
} from "@/domain/movies";
import { getErrorMessage } from "@/lib/errors";

type EditIntent = "start" | "finish" | "abandon" | "resume";

export type MovieEditIntent = EditIntent;

interface MovieEditModalProps {
  movie: Movie;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMovieUpdated: () => void;
  /** Intent inicial ao abrir (ex.: Terminei / Abandonei no detalhe). */
  initialIntent?: MovieEditIntent | null;
}

export function MovieEditModal({
  movie,
  open,
  onOpenChange,
  onMovieUpdated,
  initialIntent = null,
}: MovieEditModalProps) {
  const [intent, setIntent] = useState<EditIntent>("finish");
  const [rating, setRating] = useState<number | null>(movie.rating ?? null);
  const [notes, setNotes] = useState(movie.notes ?? "");
  const [wouldRecommend, setWouldRecommend] = useState(
    movie.would_recommend !== false
  );
  const [watchedDate, setWatchedDate] = useState<Date | undefined>();
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    setRating(movie.rating ?? null);
    setNotes(movie.notes ?? "");
    setWouldRecommend(movie.would_recommend !== false);
    setWatchedDate(undefined);
    setFormError("");
    if (initialIntent) {
      setIntent(initialIntent);
    } else if (movie.status === MovieStatus.TO_WATCH) {
      setIntent("start");
    } else if (movie.status === MovieStatus.WATCHING) {
      setIntent("finish");
    } else if (movie.status === MovieStatus.ABANDONED) {
      setIntent("resume");
    } else {
      setIntent("finish");
    }
  }, [open, movie, initialIntent]);

  async function handleSave() {
    setFormError("");

    try {
      setLoading(true);
      const updateData: MovieUpdateRequest = { imdb_id: movie.imdb_id };

      if (intent === "start") {
        updateData.status = MovieStatus.WATCHING;
      } else if (intent === "resume") {
        updateData.status = MovieStatus.WATCHING;
      } else if (intent === "abandon") {
        updateData.status = MovieStatus.ABANDONED;
      } else if (intent === "finish") {
        if (movie.status !== MovieStatus.WATCHED && !watchedDate) {
          setFormError("Informe a data em que assistiu.");
          return;
        }
        updateData.rating = rating;
        updateData.notes = notes.trim() || null;
        updateData.would_recommend = wouldRecommend;
        updateData.status = MovieStatus.WATCHED;
        if (watchedDate) {
          const nextDate = watchedDate.toISOString().split("T")[0];
          updateData.watched_dates = [
            ...normalizeWatchedDates(movie.watched_dates),
            nextDate,
          ];
        }
      }

      await updateMovie(updateData);

      const messages: Record<EditIntent, string> = {
        start: "Começou a assistir!",
        finish:
          movie.status === MovieStatus.WATCHED
            ? "Opinião atualizada!"
            : "Opinião registrada!",
        abandon: "Marcado como abandonado.",
        resume: "De volta à maratona!",
      };

      toast({
        title: "Sucesso",
        description: messages[intent],
        duration: 2000,
      });

      onOpenChange(false);
      onMovieUpdated();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Falha ao atualizar título."),
        variant: "destructive",
        duration: 2000,
      });
    } finally {
      setLoading(false);
    }
  }

  const title =
    intent === "start"
      ? "Começar a assistir"
      : intent === "abandon"
        ? "Abandonar título"
        : intent === "resume"
          ? "Retomar"
          : movie.status === MovieStatus.WATCHED
            ? "Editar opinião"
            : "Avaliar título";

  const showFinishFields = intent === "finish";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
        <DialogTitle>{title}</DialogTitle>

        <div className="flex items-start gap-3 sm:gap-4">
          <img
            src={movie.poster || "/placeholder.svg"}
            alt={movie.title}
            className="h-20 w-14 flex-none rounded object-cover sm:h-24 sm:w-16"
          />
          <div className="min-w-0">
            <h3 className="truncate text-base font-medium sm:text-lg">
              {movie.title} ({movie.year})
            </h3>
            <p className="truncate text-sm text-muted-foreground">
              {MOVIE_TYPE_LABELS[movie.type]}
            </p>
            <p className="text-xs text-muted-foreground">
              {MOVIE_STATUS_LABELS[movie.status]}
            </p>
          </div>
        </div>

        <div className={FORM_FIELDS_CLASS}>
          {(movie.status === MovieStatus.TO_WATCH ||
            movie.status === MovieStatus.WATCHING ||
            movie.status === MovieStatus.ABANDONED) && (
            <div className="flex flex-wrap gap-2">
              {movie.status === MovieStatus.TO_WATCH && (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant={intent === "start" ? "default" : "outline"}
                    onClick={() => setIntent("start")}
                  >
                    Começar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={intent === "finish" ? "default" : "outline"}
                    onClick={() => setIntent("finish")}
                  >
                    Já assisti
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={intent === "abandon" ? "default" : "outline"}
                    onClick={() => setIntent("abandon")}
                  >
                    Abandonar
                  </Button>
                </>
              )}
              {movie.status === MovieStatus.WATCHING && (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant={intent === "finish" ? "default" : "outline"}
                    onClick={() => setIntent("finish")}
                  >
                    Terminei
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={intent === "abandon" ? "default" : "outline"}
                    onClick={() => setIntent("abandon")}
                  >
                    Abandonar
                  </Button>
                </>
              )}
              {movie.status === MovieStatus.ABANDONED && (
                <Button
                  type="button"
                  size="sm"
                  variant={intent === "resume" ? "default" : "outline"}
                  onClick={() => setIntent("resume")}
                >
                  Retomar
                </Button>
              )}
            </div>
          )}

          {intent === "start" && (
            <p className="text-sm text-muted-foreground">
              Vai para a aba Assistindo
              {movie.type === "series"
                ? " — acompanhe os episódios no detalhe."
                : "."}
            </p>
          )}

          {intent === "abandon" && (
            <p className="text-sm text-muted-foreground">
              Vai para a aba Abandonei. Você pode retomar depois.
            </p>
          )}

          {intent === "resume" && (
            <p className="text-sm text-muted-foreground">
              Volta para Assistindo
              {movie.type === "series"
                ? " — o progresso de episódios é mantido."
                : "."}
            </p>
          )}

          {showFinishFields && (
            <>
              <div>
                <FormLabel optional>Nota</FormLabel>
                <div className="space-y-2">
                  <ScoreRating value={rating} onChange={setRating} />
                  {rating != null && rating > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {formatMovieRating(rating)}/10 —{" "}
                      {getMovieRatingLabel(rating)} · clique na metade esquerda
                      para meia nota
                    </p>
                  )}
                </div>
              </div>

              <div>
                <FormLabel
                  required={movie.status !== MovieStatus.WATCHED}
                  optional={movie.status === MovieStatus.WATCHED}
                >
                  {movie.status === MovieStatus.WATCHED
                    ? "Nova data assistida"
                    : "Data assistida"}
                </FormLabel>
                <DatePicker
                  date={watchedDate}
                  onSelect={setWatchedDate}
                  placeholder="Selecione a data"
                />
              </div>

              <div>
                <FormLabel optional>O que achou?</FormLabel>
                <textarea
                  className="flex min-h-[88px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  placeholder="Final, atuação, vibe, spoilers livres..."
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

          {formError && <p className="text-sm text-destructive">{formError}</p>}

          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button
              variant="outline"
              className="w-full sm:flex-1"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => void handleSave()}
              disabled={loading}
              className="w-full sm:flex-1"
            >
              {loading
                ? "Salvando…"
                : intent === "start"
                  ? "Começar"
                  : intent === "abandon"
                    ? "Confirmar"
                    : intent === "resume"
                      ? "Retomar"
                      : movie.status === MovieStatus.WATCHED
                        ? "Salvar alterações"
                        : "Salvar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
