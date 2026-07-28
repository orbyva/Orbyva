import { Trash2, Star, ThumbsDown, ThumbsUp, Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useRef, useState } from "react";
import type { Book } from "@/types/books";
import {
  formatAuthors,
  formatBookmark,
  getBookCardRating,
  getReadingProgress,
} from "@/domain/books";

interface BookCardProps {
  book: Book;
  onClick: () => void;
  onDelete: (googleId: string) => Promise<void>;
}

export function BookCard({ book, onClick, onDelete }: BookCardProps) {
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const suppressCardClickRef = useRef(false);

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      await onDelete(book.google_id);
      setIsDeleteDialogOpen(false);
    } finally {
      setIsDeleting(false);
    }
  };

  function handleDeleteOpenChange(open: boolean) {
    setIsDeleteDialogOpen(open);
    if (!open) {
      suppressCardClickRef.current = true;
      window.setTimeout(() => {
        suppressCardClickRef.current = false;
      }, 300);
    }
  }

  const ratingBadge = getBookCardRating(book);
  const read = book.status === "read";
  const reading = book.status === "reading";
  const abandoned = book.status === "abandoned";
  const bookmark = reading ? formatBookmark(book) : null;
  const progress = reading ? getReadingProgress(book) : null;

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
              aria-label={`Excluir ${book.title}`}
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
              <span className="font-medium">{book.title}</span>?
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

        {ratingBadge && (
          <div
            className="
              absolute left-2 top-2 z-10
              flex items-center gap-1 rounded-md
              bg-black/80 px-2 py-1 text-white
              text-xs sm:text-sm
            "
            title={
              ratingBadge.source === "google"
                ? "Nota média Google Books (escala 0–10)"
                : "Sua nota"
            }
          >
            <Star className="h-4 w-4 fill-warning text-warning" />
            <span className="font-medium">{ratingBadge.value}</span>
          </div>
        )}

        {reading && progress != null && !ratingBadge && (
          <div
            className="
              absolute left-2 top-2 z-10
              flex items-center gap-1 rounded-md
              bg-black/80 px-2 py-1 text-white
              text-xs sm:text-sm
            "
          >
            <Bookmark className="h-3.5 w-3.5" />
            <span className="font-medium">{progress}%</span>
          </div>
        )}

        {read && (
          <div className="absolute bottom-2 left-2 z-10 rounded-md bg-black/75 p-1.5">
            {book.would_recommend === false ? (
              <ThumbsDown className="h-3.5 w-3.5 text-destructive" />
            ) : (
              <ThumbsUp className="h-3.5 w-3.5 text-success" />
            )}
          </div>
        )}

        {abandoned && (
          <div className="absolute bottom-2 left-2 z-10 rounded-md bg-black/75 px-1.5 py-1 text-[10px] font-medium text-white">
            Abandonado
          </div>
        )}

        {reading && progress != null && (
          <div className="absolute inset-x-0 bottom-0 z-10 h-1 bg-black/40">
            <div
              className="h-full bg-primary"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        <img
          src={book.cover_url || "/placeholder.svg"}
          alt={book.title}
          className="
            aspect-[2/3] w-full
            object-cover
            transition-transform duration-300
            md:group-hover:scale-[1.02]
          "
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      </div>

      <div className="mt-2 space-y-0.5">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug sm:text-base">
          {book.title}
        </h3>
        <p className="line-clamp-1 text-xs text-muted-foreground sm:text-sm">
          {formatAuthors(book.authors)}
          {book.published_year ? ` · ${book.published_year}` : ""}
        </p>
        {bookmark && (
          <p className="flex items-center gap-1 text-[11px] text-primary sm:text-xs">
            <Bookmark className="h-3 w-3" />
            {bookmark}
            {progress != null ? ` · ${progress}%` : ""}
          </p>
        )}
        {book.notes?.trim() && read && (
          <p className="line-clamp-2 text-[11px] text-muted-foreground/90 sm:text-xs">
            {book.notes}
          </p>
        )}
      </div>
    </div>
  );
}
