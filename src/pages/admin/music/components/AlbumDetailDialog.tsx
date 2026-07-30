import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Disc3,
  Heart,
  Pencil,
  RefreshCw,
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
  ALBUM_STATUS_LABELS,
  ALBUM_TYPE_LABELS,
  formatAlbumRating,
  formatArtists,
  formatTrackLength,
  getAlbumRatingLabel,
  getLatestListenedDate,
  trackRatingKey,
} from "@/domain/music";
import type { Album } from "@/types/music";
import { formatDateBR } from "@/lib/currency";
import {
  fetchCatalogAlbumMeta,
  fetchCatalogTracklist,
  isCatalogSyncedSource,
  type AlbumTrack,
} from "@/lib/musicCatalog";
import { updateAlbum } from "@/api/albums";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

interface AlbumDetailDialogProps {
  album: Album | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: () => void;
  onShare?: () => void;
  onDelete?: () => void;
  onAlbumUpdated?: () => void;
  onAlbumPatch?: (patch: Partial<Album>) => void;
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

export function AlbumDetailDialog({
  album,
  open,
  onOpenChange,
  onEdit,
  onShare,
  onDelete,
  onAlbumUpdated,
  onAlbumPatch,
}: AlbumDetailDialogProps) {
  const [tracks, setTracks] = useState<AlbumTrack[]>([]);
  const [tracksLoading, setTracksLoading] = useState(false);
  const [tracksError, setTracksError] = useState("");
  const [trackRatings, setTrackRatings] = useState<Record<string, number>>({});
  const [ratingSavingKey, setRatingSavingKey] = useState<string | null>(null);
  /** Nota inline (evita Popover flutuando no Dialog com scroll). */
  const [editingTrackKey, setEditingTrackKey] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const { toast } = useToast();

  const fromCatalog = Boolean(
    album && isCatalogSyncedSource(album.source, album.musicbrainz_id)
  );

  useEffect(() => {
    if (!album) {
      setTrackRatings({});
      setEditingTrackKey(null);
      return;
    }
    setTrackRatings(album.track_ratings ?? {});
    setEditingTrackKey(null);
  }, [album?.musicbrainz_id, album?.track_ratings]);

  useEffect(() => {
    if (!open) setEditingTrackKey(null);
  }, [open]);

  useEffect(() => {
    abortRef.current?.abort();
    if (!open || !album || !fromCatalog) {
      setTracks([]);
      setTracksError("");
      setTracksLoading(false);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setTracksLoading(true);
    setTracksError("");
    setTracks([]);

    void fetchCatalogTracklist(
      album.musicbrainz_id,
      album.source,
      album.title,
      controller.signal
    )
      .then((list) => {
        if (controller.signal.aborted) return;
        setTracks(list);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        setTracksError(
          getErrorMessage(error, "Não foi possível carregar a tracklist.")
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setTracksLoading(false);
      });

    return () => controller.abort();
  }, [open, album?.musicbrainz_id, album?.title, album?.source, fromCatalog]);

  if (!album) return null;

  const latest = getLatestListenedDate(album.listened_dates);
  const recommend = album.would_recommend !== false;
  const favorited = album.is_favorite === true;
  const multiDisc = tracks.some((t) => t.disc > 1);

  async function handleToggleFavorite() {
    if (favoriteBusy || !album) return;
    const next = !favorited;
    setFavoriteBusy(true);
    onAlbumPatch?.({ is_favorite: next });
    try {
      await updateAlbum({
        musicbrainz_id: album.musicbrainz_id,
        is_favorite: next,
      });
    } catch (error) {
      onAlbumPatch?.({ is_favorite: favorited });
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Falha ao atualizar favorito."),
        variant: "destructive",
      });
    } finally {
      setFavoriteBusy(false);
    }
  }

  async function handleTrackRating(track: AlbumTrack, next: number | null) {
    if (!album) return;
    const key = trackRatingKey(track.disc, track.position);
    const previous = { ...trackRatings };
    const updated = { ...trackRatings };
    if (next == null || next <= 0) delete updated[key];
    else updated[key] = next;

    setTrackRatings(updated);
    setRatingSavingKey(key);
    setEditingTrackKey(null);
    try {
      await updateAlbum({
        musicbrainz_id: album.musicbrainz_id,
        track_ratings: updated,
      });
      onAlbumUpdated?.();
    } catch (error) {
      setTrackRatings(previous);
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Falha ao salvar nota da faixa."),
        variant: "destructive",
      });
    } finally {
      setRatingSavingKey(null);
    }
  }

  async function handleRefresh() {
    if (!album || !fromCatalog) return;
    setRefreshing(true);
    try {
      const meta = await fetchCatalogAlbumMeta(
        album.musicbrainz_id,
        album.source
      );
      if (!meta) {
        toast({
          title: "Não encontrado",
          description: "O catálogo não retornou este lançamento.",
          variant: "destructive",
        });
        return;
      }
      await updateAlbum({
        musicbrainz_id: album.musicbrainz_id,
        title: meta.title,
        artists: meta.artists,
        release_year: meta.release_year,
        album_type: meta.album_type,
        cover_url: meta.cover_url,
        source: album.source,
      });
      toast({
        title: "Atualizado",
        description: "Metadados e capa sincronizados com o catálogo.",
        duration: 2000,
      });
      onAlbumUpdated?.();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Falha ao atualizar."),
        variant: "destructive",
      });
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${FORM_DIALOG_CONTENT_CLASS} sm:max-w-xl`}>
        <DialogHeader>
          <div className="flex items-start gap-3 pr-6">
            <img
              src={album.cover_url || "/placeholder.svg"}
              alt={album.title}
              className="h-28 w-28 flex-none rounded-lg object-cover sm:h-36 sm:w-36"
              referrerPolicy="no-referrer"
              onError={(e) => {
                (e.target as HTMLImageElement).src = "/placeholder.svg";
              }}
            />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-start gap-2">
                <DialogTitle className="min-w-0 flex-1 text-left leading-snug">
                  {album.title}
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
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="text-[10px]">
                  {ALBUM_STATUS_LABELS[album.status]}
                </Badge>
                <Badge variant="secondary" className="text-[10px]">
                  {ALBUM_TYPE_LABELS[album.album_type]}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {formatArtists(album.artists)}
                {album.release_year != null ? ` · ${album.release_year}` : ""}
              </p>
              {album.status === "listened" &&
                (recommend ? (
                  <ThumbsUp className="h-5 w-5 text-success" />
                ) : (
                  <ThumbsDown className="h-5 w-5 text-destructive" />
                ))}
            </div>
          </div>
        </DialogHeader>

        <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1">
          {album.rating != null && album.rating > 0 && (
            <DetailRow label="Sua nota">
              <div className="space-y-2">
                <ScoreRating value={album.rating} readonly size="sm" />
                <p className="text-muted-foreground">
                  {formatAlbumRating(album.rating)}/10 ·{" "}
                  {getAlbumRatingLabel(album.rating)}
                </p>
              </div>
            </DetailRow>
          )}

          {latest && (
            <DetailRow label="Última vez">
              {formatDateBR(latest.slice(0, 10))}
            </DetailRow>
          )}

          {album.source === "manual" ? (
            <DetailRow label="Origem">Cadastro manual</DetailRow>
          ) : album.source === "spotify" || album.source === "musicbrainz" ? (
            <DetailRow label="Origem">Catálogo</DetailRow>
          ) : null}

          {album.notes?.trim() && (
            <DetailRow label="O que você achou?">
              <p className="whitespace-pre-wrap text-muted-foreground">
                {album.notes}
              </p>
            </DetailRow>
          )}

          {album.status === "listened" && (
            <DetailRow label="Recomendação">
              {recommend ? "Recomendaria" : "Não recomendaria"}
            </DetailRow>
          )}

          {fromCatalog && (
            <DetailRow label="Faixas">
              {tracksLoading ? (
                <p className="text-muted-foreground">Carregando tracklist…</p>
              ) : tracksError ? (
                <p className="text-destructive">{tracksError}</p>
              ) : tracks.length === 0 ? (
                <p className="text-muted-foreground">
                  Nenhuma faixa encontrada no catálogo.
                </p>
              ) : (
                <ol className="space-y-2">
                  {tracks.map((track, idx) => {
                    const key = trackRatingKey(track.disc, track.position);
                    const rating = trackRatings[key] ?? null;
                    const editing = editingTrackKey === key;
                    const saving = ratingSavingKey === key;
                    return (
                      <li
                        key={`${key}-${track.title}-${idx}`}
                        className="space-y-2 rounded-md border border-transparent px-0.5 py-1 data-[editing=true]:border-border data-[editing=true]:bg-muted/30 data-[editing=true]:px-2 data-[editing=true]:py-2"
                        data-editing={editing || undefined}
                      >
                        <div className="flex items-center gap-2 text-sm">
                          <span className="w-10 flex-none tabular-nums text-muted-foreground">
                            {multiDisc
                              ? `${track.disc}.${track.position}`
                              : track.position}
                          </span>
                          <span className="min-w-0 flex-1 truncate">
                            {track.title}
                          </span>
                          <span className="flex-none tabular-nums text-xs text-muted-foreground">
                            {formatTrackLength(track.lengthMs)}
                          </span>
                          <button
                            type="button"
                            disabled={saving}
                            className={cn(
                              "min-w-[2.5rem] flex-none rounded-md border px-1.5 py-0.5 text-xs font-semibold tabular-nums transition-colors",
                              rating != null && rating > 0
                                ? "border-warning/60 bg-warning/15 text-foreground"
                                : "border-dashed border-muted-foreground/40 text-muted-foreground hover:border-muted-foreground/70",
                              editing && "ring-1 ring-primary/40"
                            )}
                            aria-expanded={editing}
                            aria-label={
                              rating != null && rating > 0
                                ? `Nota ${formatAlbumRating(rating)}. Alterar`
                                : "Avaliar faixa"
                            }
                            onClick={() =>
                              setEditingTrackKey(editing ? null : key)
                            }
                          >
                            {rating != null && rating > 0
                              ? formatAlbumRating(rating)
                              : "Nota"}
                          </button>
                        </div>
                        {editing ? (
                          <div className="pl-10 sm:pl-12">
                            <p className="mb-1.5 text-xs text-muted-foreground">
                              Nota da faixa
                            </p>
                            <ScoreRating
                              value={rating}
                              size="sm"
                              onChange={(next) => {
                                void handleTrackRating(track, next);
                              }}
                            />
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              )}
            </DetailRow>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:flex-wrap sm:justify-end">
          {onDelete && (
            <ConfirmDeleteDialog
              title="Excluir este álbum?"
              description={`"${album.title}" será removido da sua lista.`}
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
          {fromCatalog && (
            <Button
              variant="outline"
              disabled={refreshing}
              onClick={() => void handleRefresh()}
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
              />
              {refreshing ? "Atualizando…" : "Atualizar do catálogo"}
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          {onShare && album.status === "listened" && (
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
              {album.status === "to_listen" ? (
                <>
                  <Disc3 className="mr-2 h-4 w-4" />
                  Ouvi
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
