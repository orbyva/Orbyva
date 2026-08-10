import { useState, type ReactNode } from "react";
import {
  Clapperboard,
  Heart,
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
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { ScoreRating } from "@/components/ScoreRating";
import {
  CINEMA_TYPE_TONE,
  StatusPill,
  ToneChip,
  type StatusPillTone,
} from "@/components/StatusPill";
import { FORM_DIALOG_CONTENT_CLASS } from "@/components/FormLabel";
import {
  MOVIE_STATUS_LABELS,
  MOVIE_TYPE_LABELS,
  asStringList,
  formatMovieRating,
  getLatestWatchedDate,
  getMovieRatingLabel,
} from "@/domain/movies";
import type { Movie } from "@/types/movies";
import { MovieStatus } from "@/types/movies";
import { formatDateBR } from "@/lib/currency";
import { updateMovie } from "@/api/movies";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import type { MovieEditIntent } from "./MovieEditModal";
import { SeriesEpisodesPanel } from "./SeriesEpisodesPanel";

interface MovieDetailDialogProps {
  movie: Movie | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: (intent?: MovieEditIntent) => void;
  onShare?: () => void;
  onDelete?: () => void;
  onMoviePatch?: (patch: Partial<Movie>) => void;
  onWatchedEpisodesChange?: (count: number) => void;
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

function movieStatusTone(status: MovieStatus): StatusPillTone {
  switch (status) {
    case MovieStatus.TO_WATCH:
      return "warning";
    case MovieStatus.WATCHING:
      return "primary";
    case MovieStatus.WATCHED:
      return "success";
    case MovieStatus.ABANDONED:
      return "muted";
    default:
      return "muted";
  }
}

/** Ações de ciclo quietas — fora do footer, sem cara de “Salvar”. */
function WatchingLifecycleLinks({
  onFinish,
  onAbandon,
}: {
  onFinish: () => void;
  onAbandon: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-1 text-sm">
      <button
        type="button"
        className="font-medium text-foreground underline-offset-4 hover:underline"
        onClick={onFinish}
      >
        Terminei
      </button>
      <span className="text-muted-foreground/50" aria-hidden>
        ·
      </span>
      <button
        type="button"
        className="font-medium text-destructive underline-offset-4 hover:underline"
        onClick={onAbandon}
      >
        Abandonei
      </button>
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
  onWatchedEpisodesChange,
}: MovieDetailDialogProps) {
  const { toast } = useToast();
  const [favoriteBusy, setFavoriteBusy] = useState(false);

  if (!movie) return null;

  const genres = asStringList(movie.genre);
  const actors = asStringList(movie.actors);
  const latest = getLatestWatchedDate(movie.watched_dates);
  const recommend = movie.would_recommend !== false;
  const isSeries = movie.type === "series";
  const favorited = movie.is_favorite === true;
  const movieId = movie.imdb_id;

  function openEdit(intent?: MovieEditIntent) {
    onOpenChange(false);
    onEdit?.(intent);
  }

  async function handleToggleFavorite() {
    if (favoriteBusy) return;
    const next = !favorited;
    setFavoriteBusy(true);
    onMoviePatch?.({ is_favorite: next });
    try {
      await updateMovie({ imdb_id: movieId, is_favorite: next });
    } catch (error) {
      onMoviePatch?.({ is_favorite: favorited });
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Falha ao atualizar favorito."),
        variant: "destructive",
      });
    } finally {
      setFavoriteBusy(false);
    }
  }

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
              <div className="flex items-start gap-2">
                <DialogTitle className="min-w-0 flex-1 text-left leading-snug">
                  {movie.title}
                </DialogTitle>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => void handleToggleFavorite()}
                  disabled={favoriteBusy}
                  aria-label={
                    favorited ? "Remover dos favoritos" : "Favoritar"
                  }
                  aria-pressed={favorited}
                >
                  <Heart
                    className={cn(
                      "h-5 w-5",
                      favorited && "fill-destructive text-destructive"
                    )}
                  />
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <ToneChip toneClassName={CINEMA_TYPE_TONE}>
                  {MOVIE_TYPE_LABELS[movie.type]}
                </ToneChip>
                <StatusPill tone={movieStatusTone(movie.status)}>
                  {MOVIE_STATUS_LABELS[movie.status]}
                </StatusPill>
                {movie.year != null ? (
                  <span className="text-xs text-muted-foreground">
                    {movie.year}
                  </span>
                ) : null}
                {movie.score_imdb != null ? (
                  <span className="text-xs text-muted-foreground">
                    IMDb {formatMovieRating(movie.score_imdb)}
                  </span>
                ) : null}
                {movie.status === MovieStatus.WATCHED ? (
                  recommend ? (
                    <ThumbsUp className="h-3.5 w-3.5 shrink-0 text-success" />
                  ) : (
                    <ThumbsDown className="h-3.5 w-3.5 shrink-0 text-destructive" />
                  )
                ) : null}
              </div>
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

          {onEdit &&
          movie.status === MovieStatus.WATCHING &&
          !isSeries ? (
            <WatchingLifecycleLinks
              onFinish={() => openEdit("finish")}
              onAbandon={() => openEdit("abandon")}
            />
          ) : null}

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
                  <StatusPill key={g} tone="muted">
                    {g}
                  </StatusPill>
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
                onWatchedEpisodesChange={onWatchedEpisodesChange}
                lifecycleActions={
                  onEdit && movie.status === MovieStatus.WATCHING ? (
                    <WatchingLifecycleLinks
                      onFinish={() => openEdit("finish")}
                      onAbandon={() => openEdit("abandon")}
                    />
                  ) : null
                }
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
          {onEdit && movie.status !== MovieStatus.WATCHING && (
            <Button onClick={() => openEdit()}>
              {movie.status === MovieStatus.TO_WATCH ? (
                <>
                  <Clapperboard className="mr-2 h-4 w-4" />
                  Começar
                </>
              ) : movie.status === MovieStatus.ABANDONED ? (
                <>
                  <Clapperboard className="mr-2 h-4 w-4" />
                  Retomar
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
