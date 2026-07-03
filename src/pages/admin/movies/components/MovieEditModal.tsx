"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { updateMovie } from "@/api/movies";
import { Movie, MovieStatus, MovieUpdateRequest } from "@/types/movies";
import { useToast } from "@/hooks/use-toast";
import { DatePicker } from "@/components/DatePicker";
import {
  FormLabel,
  FORM_DIALOG_CONTENT_CLASS,
  FORM_FIELDS_CLASS,
} from "@/components/FormLabel";

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
  const [rating, setRating] = useState<number | "">(movie.rating ?? "");
  const [watchedDate, setWatchedDate] = useState<Date | undefined>();
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const { toast } = useToast();

  async function handleSave() {
    if (movie.status === MovieStatus.TO_WATCH && !watchedDate) {
      setFormError("Informe a data em que assistiu o filme.");
      return;
    }

    setFormError("");

    try {
      setLoading(true);

      const updateData: MovieUpdateRequest = {
        ...movie,
        rating: rating !== "" ? Number(rating) : null,
        ...(watchedDate && {
          watched_dates: [...movie.watched_dates, watchedDate],
          status: MovieStatus.WATCHED,
        }),
      };

      await updateMovie(updateData);

      toast({
        title: "Sucesso",
        description: "Filme atualizado com sucesso!",
        duration: 2000,
      });

      onOpenChange(false);
      onMovieUpdated();
    } catch (error) {
      toast({
        title: "Erro",
        description: `Falha ao atualizar filme: ${error}`,
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
        <DialogTitle>Editar Filme</DialogTitle>

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
            <p className="truncate text-sm text-muted-foreground">{movie.imdb_id}</p>
          </div>
        </div>

        <div className={FORM_FIELDS_CLASS}>
          {movie.status === MovieStatus.TO_WATCH ? (
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
              <DatePicker
                date={watchedDate}
                onSelect={setWatchedDate}
                placeholder="Selecione a data"
              />
            </>
          ) : (
            <>
              <FormLabel optional>Nova data assistida</FormLabel>
              <DatePicker
                date={watchedDate}
                onSelect={setWatchedDate}
                placeholder="Selecione a data"
              />
            </>
          )}

          {formError && <p className="text-sm text-red-500">{formError}</p>}

          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button
              variant="outline"
              className="w-full sm:flex-1"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={loading} className="w-full sm:flex-1">
              {loading ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
