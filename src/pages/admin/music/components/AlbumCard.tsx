import { Trash2, Star, ThumbsDown, ThumbsUp, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useRef, useState } from "react";
import type { Album } from "@/types/music";
import {
  ALBUM_TYPE_LABELS,
  formatArtists,
  getAlbumCardRating,
} from "@/domain/music";
import { cn } from "@/lib/utils";

interface AlbumCardProps {
  album: Album;
  onClick: () => void;
  onDelete: (id: string) => Promise<void>;
  onToggleFavorite: (id: string, next: boolean) => Promise<void>;
}

export function AlbumCard({
  album,
  onClick,
  onDelete,
  onToggleFavorite,
}: AlbumCardProps) {
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [coverBroken, setCoverBroken] = useState(false);
  const suppressCardClickRef = useRef(false);

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      await onDelete(album.musicbrainz_id);
      setIsDeleteDialogOpen(false);
    } finally {
      setIsDeleting(false);
    }
  };

  async function handleToggleFavorite(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (favoriteBusy) return;
    setFavoriteBusy(true);
    try {
      await onToggleFavorite(album.musicbrainz_id, !album.is_favorite);
    } finally {
      setFavoriteBusy(false);
    }
  }

  function handleDeleteOpenChange(open: boolean) {
    setIsDeleteDialogOpen(open);
    if (!open) {
      suppressCardClickRef.current = true;
      window.setTimeout(() => {
        suppressCardClickRef.current = false;
      }, 300);
    }
  }

  const rating = getAlbumCardRating(album);
  const listened = album.status === "listened";
  const favorited = album.is_favorite === true;

  return (
    <div
      className="group relative cursor-pointer rounded-xl focus-within:ring-2 focus-within:ring-ring"
      onClick={() => {
        if (suppressCardClickRef.current || isDeleteDialogOpen) return;
        onClick();
      }}
    >
      <div className="relative overflow-hidden rounded-xl bg-muted">
        <Dialog
          open={isDeleteDialogOpen}
          onOpenChange={handleDeleteOpenChange}
        >
          <DialogTrigger asChild>
            <Button
              variant="destructive"
              size="icon"
              className="
                absolute right-2 top-2 z-20
                h-10 w-10 md:h-9 md:w-9
                opacity-100 md:opacity-0
                md:group-hover:opacity-100
                transition-opacity
              "
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDeleteDialogOpen(true);
              }}
              aria-label={`Excluir ${album.title}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </DialogTrigger>

          <DialogContent
            className="w-[calc(100%-2rem)] sm:max-w-md"
            onClick={(e) => e.stopPropagation()}
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <DialogTitle>Confirmar Exclusão</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Tem certeza que deseja excluir{" "}
              <span className="font-medium">{album.title}</span>?
            </p>
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleDeleteOpenChange(false);
                }}
                className="w-full sm:w-auto"
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void handleDelete();
                }}
                disabled={isDeleting}
                className="w-full sm:w-auto"
              >
                {isDeleting ? "Excluindo..." : "Excluir"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Button
          type="button"
          variant="secondary"
          size="icon"
          className={cn(
            "absolute bottom-2 right-2 z-20 h-9 w-9 bg-black/75 text-white hover:bg-black/90",
            favorited
              ? "opacity-100"
              : "opacity-100 md:opacity-0 md:group-hover:opacity-100"
          )}
          onClick={(e) => void handleToggleFavorite(e)}
          disabled={favoriteBusy}
          aria-label={
            favorited
              ? `Remover ${album.title} dos favoritos`
              : `Favoritar ${album.title}`
          }
          aria-pressed={favorited}
        >
          <Heart
            className={cn(
              "h-4 w-4",
              favorited && "fill-destructive text-destructive"
            )}
          />
        </Button>

        {rating && (
          <div
            className="
              absolute left-2 top-2 z-10
              flex items-center gap-1 rounded-md
              bg-black/80 px-2 py-1 text-white
              text-xs sm:text-sm
            "
          >
            <Star className="h-4 w-4 fill-warning text-warning" />
            <span className="font-medium">{rating}</span>
          </div>
        )}

        {listened && (
          <div className="absolute bottom-2 left-2 z-10 rounded-md bg-black/75 p-1.5">
            {album.would_recommend === false ? (
              <ThumbsDown className="h-3.5 w-3.5 text-destructive" />
            ) : (
              <ThumbsUp className="h-3.5 w-3.5 text-success" />
            )}
          </div>
        )}

        <img
          src={
            coverBroken || !album.cover_url
              ? "/placeholder.svg"
              : album.cover_url
          }
          alt={album.title}
          className="aspect-square w-full object-cover transition-transform duration-300 md:group-hover:scale-[1.02]"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setCoverBroken(true)}
        />
      </div>

      <div className="mt-2 space-y-0.5">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug sm:text-base">
          {album.title}
        </h3>
        <p className="line-clamp-1 text-xs text-muted-foreground sm:text-sm">
          {formatArtists(album.artists)}
          {album.release_year ? ` · ${album.release_year}` : ""}
        </p>
        <p className="text-[11px] text-muted-foreground/90 sm:text-xs">
          {ALBUM_TYPE_LABELS[album.album_type]}
        </p>
      </div>
    </div>
  );
}
