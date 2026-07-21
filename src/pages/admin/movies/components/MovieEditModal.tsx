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
import { formatMovieRating, getMovieRatingLabel, normalizeWatchedDates } from "@/domain/movies";
import { getErrorMessage } from "@/lib/errors";

interface MovieEditModalProps {
  movie: Movie;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMovieUpdated: () => void;
}

export function MovieEditModal({
  movie,
  open,
  onOpenChange,
  onMovieUpdated,
}: MovieEditModalProps) {
  const [rating, setRating] = useState<number | null>(movie.rating ?? null);
  const [notes, setNotes] = useState(movie.notes ?? "");
  const [wouldRecommend, setWouldRecommend] = useState(
    movie.would_recommend !== false
  );
  const [watchedDate, setWatchedDate] = useState<Date | undefined>();
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const { toast } = useToast();

  const isToWatch = movie.status === MovieStatus.TO_WATCH;

  useEffect(() => {
    if (!open) return;
    setRating(movie.rating ?? null);
    setNotes(movie.notes ?? "");
    setWouldRecommend(movie.would_recommend !== false);
    setWatchedDate(undefined);
    setFormError("");
  }, [open, movie]);

  async function handleSave() {
    if (isToWatch && !watchedDate) {
      setFormError("Informe a data em que assistiu.");
      return;
    }

    setFormError("");

    try {
      setLoading(true);

      const updateData: MovieUpdateRequest = {
        imdb_id: movie.imdb_id,
        rating,
        notes: notes.trim() || null,
        would_recommend: wouldRecommend,
      };

      if (watchedDate) {
        const nextDate = watchedDate.toISOString().split("T")[0];
        updateData.watched_dates = [
          ...normalizeWatchedDates(movie.watched_dates),
          nextDate,
        ];
        updateData.status = MovieStatus.WATCHED;
      }

      await updateMovie(updateData);

      toast({
        title: "Sucesso",
        description: isToWatch
          ? "Opinião registrada!"
          : "Opinião atualizada!",
        duration: 2000,
      });

      onOpenChange(false);
      onMovieUpdated();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Falha ao atualizar filme."),
        variant: "destructive",
        duration: 2000,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
        <DialogTitle>
          {isToWatch ? "Avaliar título" : "Editar opinião"}
        </DialogTitle>

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
              {movie.imdb_id}
            </p>
          </div>
        </div>

        <div className={FORM_FIELDS_CLASS}>
          <div>
            <FormLabel optional>Nota</FormLabel>
            <div className="space-y-2">
              <ScoreRating value={rating} onChange={setRating} />
              {rating != null && rating > 0 && (
                <p className="text-xs text-muted-foreground">
                  {formatMovieRating(rating)}/10 — {getMovieRatingLabel(rating)}{" "}
                  · clique na metade esquerda para meia nota
                </p>
              )}
            </div>
          </div>

          <div>
            <FormLabel required={isToWatch} optional={!isToWatch}>
              {isToWatch ? "Data assistida" : "Nova data assistida"}
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
              className="flex min-h-[88px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
              onClick={handleSave}
              disabled={loading}
              className="w-full sm:flex-1"
            >
              {loading ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
