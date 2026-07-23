import type { ReactNode } from "react";
import {
  Clapperboard,
  Pencil,
  Share2,
  ThumbsDown,
  ThumbsUp,
  Trash2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { ScoreRating } from "@/components/ScoreRating";
import { FORM_DIALOG_CONTENT_CLASS } from "@/components/FormLabel";
import {
  MOVIE_TYPE_LABELS,
  asStringList,
  formatMovieRating,
  getLatestWatchedDate,
  getMovieRatingLabel,
} from "@/domain/movies";
import type { Movie } from "@/types/movies";
import { MovieStatus } from "@/types/movies";
import { formatDateBR } from "@/lib/currency";
import { SeriesEpisodesPanel } from "./SeriesEpisodesPanel";

interface MovieDetailDialogProps {
  movie: Movie | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: () => void;
  onShare?: () => void;
  onDelete?: () => void;
  onMoviePatch?: (patch: Partial<Movie>) => void;
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

export function MovieDetailDialog({
  movie,
  open,
  onOpenChange,
  onEdit,
  onShare,
  onDelete,
  onMoviePatch,
}: MovieDetailDialogProps) {
  if (!movie) return null;

  const genres = asStringList(movie.genre);
  const actors = asStringList(movie.actors);
  const latest = getLatestWatchedDate(movie.watched_dates);
  const recommend = movie.would_recommend !== false;
  const isSeries = movie.type === "series";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`${FORM_DIALOG_CONTENT_CLASS} ${isSeries ? "sm:max-w-2xl" : "sm:max-w-xl"}`}
      >
        <DialogHeader>
          <div className="flex items-start gap-3 pr-6">
            <img
              src={movie.poster || "/placeholder.svg"}
              alt={movie.title}
              className="h-28 w-20 flex-none rounded-lg object-cover sm:h-36 sm:w-24"
            />
            <div className="min-w-0 flex-1 space-y-2">
              <DialogTitle className="text-left leading-snug">
                {movie.title}
              </DialogTitle>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="text-[10px]">
                  {MOVIE_TYPE_LABELS[movie.type]}
                </Badge>
                <span className="text-sm text-muted-foreground">{movie.year}</span>
                {movie.score_imdb != null && (
                  <span className="text-xs text-muted-foreground">
                    IMDb {formatMovieRating(movie.score_imdb)}
                  </span>
                )}
              </div>
              {movie.status === MovieStatus.WATCHED && (
                recommend ? (
                  <ThumbsUp className="h-5 w-5 text-success" />
                ) : (
                  <ThumbsDown className="h-5 w-5 text-destructive" />
                )
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1">
          {movie.rating != null && movie.rating > 0 && (
            <DetailRow label="Sua nota">
              <div className="space-y-2">
                <ScoreRating value={movie.rating} readonly size="sm" />
                <p className="text-muted-foreground">
                  {formatMovieRating(movie.rating)}/10 ·{" "}
                  {getMovieRatingLabel(movie.rating)}
                </p>
              </div>
            </DetailRow>
          )}

          <DetailRow label="Status">
            {movie.status === MovieStatus.WATCHED
              ? "Assistido"
              : "Para assistir"}
          </DetailRow>

          {latest && (
            <DetailRow label="Última vez">
              {formatDateBR(latest.slice(0, 10))}
            </DetailRow>
          )}

          {movie.director && (
            <DetailRow label="Direção">{movie.director}</DetailRow>
          )}

          {genres.length > 0 && (
            <DetailRow label="Gênero">
              <div className="flex flex-wrap gap-1.5">
                {genres.map((g) => (
                  <Badge key={g} variant="secondary" className="text-[10px]">
                    {g}
                  </Badge>
                ))}
              </div>
            </DetailRow>
          )}

          {actors.length > 0 && (
            <DetailRow label="Elenco">{actors.join(", ")}</DetailRow>
          )}

          {movie.plot && (
            <DetailRow label="Sinopse">
              <p className="text-muted-foreground leading-relaxed">{movie.plot}</p>
            </DetailRow>
          )}

          {movie.notes?.trim() && (
            <DetailRow label="O que você achou?">
              <p className="whitespace-pre-wrap text-muted-foreground">
                {movie.notes}
              </p>
            </DetailRow>
          )}

          {movie.status === MovieStatus.WATCHED && (
            <DetailRow label="Recomendação">
              {recommend ? "Recomendaria" : "Não recomendaria"}
            </DetailRow>
          )}

          {isSeries && open && (
            <div className="border-t pt-4">
              <SeriesEpisodesPanel
                movie={movie}
                onMoviePatch={onMoviePatch}
              />
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:flex-wrap sm:justify-end">
          {onDelete && (
            <ConfirmDeleteDialog
              title="Excluir este título?"
              description={`"${movie.title}" será removido da sua lista.`}
              onConfirm={() => {
                onDelete();
                onOpenChange(false);
              }}
            >
              <Button variant="outline" className="text-destructive sm:mr-auto">
                <Trash2 className="mr-2 h-4 w-4" />
                Excluir
              </Button>
            </ConfirmDeleteDialog>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          {onShare && movie.status === MovieStatus.WATCHED && (
            <Button variant="outline" onClick={onShare}>
              <Share2 className="mr-2 h-4 w-4" />
              Compartilhar
            </Button>
          )}
          {onEdit && (
            <Button
              onClick={() => {
                onOpenChange(false);
                onEdit();
              }}
            >
              {movie.status === MovieStatus.TO_WATCH ? (
                <>
                  <Clapperboard className="mr-2 h-4 w-4" />
                  Avaliar
                </>
              ) : (
                <>
                  <Pencil className="mr-2 h-4 w-4" />
                  Editar
                </>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
