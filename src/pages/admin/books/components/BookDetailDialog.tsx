import type { ReactNode } from "react";
import {
  Bookmark,
  BookOpen,
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
  BOOK_STATUS_LABELS,
  formatAuthors,
  formatBookRating,
  formatBookmark,
  getBookRatingLabel,
  getLatestReadDate,
  getReadingProgress,
} from "@/domain/books";
import type { Book } from "@/types/books";
import { formatDateBR } from "@/lib/currency";
import { BookReadingNotes } from "./BookReadingNotes";

interface BookDetailDialogProps {
  book: Book | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: () => void;
  onShare?: () => void;
  onDelete?: () => void;
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

export function BookDetailDialog({
  book,
  open,
  onOpenChange,
  onEdit,
  onShare,
  onDelete,
}: BookDetailDialogProps) {
  if (!book) return null;

  const latest = getLatestReadDate(book.read_dates);
  const recommend = book.would_recommend !== false;
  const bookmark = book.status === "reading" ? formatBookmark(book) : null;
  const progress =
    book.status === "reading" ? getReadingProgress(book) : null;
  const editLabel =
    book.status === "to_read"
      ? "Começar"
      : book.status === "reading"
        ? "Atualizar"
        : book.status === "abandoned"
          ? "Retomar"
          : "Editar";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${FORM_DIALOG_CONTENT_CLASS} sm:max-w-xl`}>
        <DialogHeader>
          <div className="flex items-start gap-3 pr-6">
            <img
              src={book.cover_url || "/placeholder.svg"}
              alt={book.title}
              className="h-28 w-20 flex-none rounded-lg object-cover sm:h-36 sm:w-24"
              referrerPolicy="no-referrer"
            />
            <div className="min-w-0 flex-1 space-y-2">
              <DialogTitle className="text-left leading-snug">
                {book.title}
              </DialogTitle>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="text-[10px]">
                  {BOOK_STATUS_LABELS[book.status]}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {formatAuthors(book.authors)}
                </span>
                {book.published_year != null && (
                  <span className="text-sm text-muted-foreground">
                    · {book.published_year}
                  </span>
                )}
              </div>
              {book.status === "read" &&
                (recommend ? (
                  <ThumbsUp className="h-5 w-5 text-success" />
                ) : (
                  <ThumbsDown className="h-5 w-5 text-destructive" />
                ))}
            </div>
          </div>
        </DialogHeader>

        <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1">
          {book.rating != null && book.rating > 0 && (
            <DetailRow label="Sua nota">
              <div className="space-y-2">
                <ScoreRating value={book.rating} readonly size="sm" />
                <p className="text-muted-foreground">
                  {formatBookRating(book.rating)}/10 ·{" "}
                  {getBookRatingLabel(book.rating)}
                </p>
              </div>
            </DetailRow>
          )}

          {book.status === "reading" && (
            <DetailRow label="Marca-página">
              <div className="space-y-2">
                <p className="flex items-center gap-1.5">
                  <Bookmark className="h-3.5 w-3.5 text-primary" />
                  {bookmark ?? "Ainda não marcada"}
                  {progress != null ? ` · ${progress}%` : ""}
                </p>
                {progress != null && (
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-[width]"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                )}
              </div>
            </DetailRow>
          )}

          {latest && (
            <DetailRow label="Última leitura">
              {formatDateBR(latest.slice(0, 10))}
            </DetailRow>
          )}

          {book.page_count != null &&
            book.page_count > 0 &&
            book.status !== "reading" && (
              <DetailRow label="Páginas">{book.page_count}</DetailRow>
            )}

          {book.publisher && (
            <DetailRow label="Editora">{book.publisher}</DetailRow>
          )}

          {book.categories.length > 0 && (
            <DetailRow label="Categorias">
              <div className="flex flex-wrap gap-1.5">
                {book.categories.map((c) => (
                  <Badge key={c} variant="secondary" className="text-[10px]">
                    {c}
                  </Badge>
                ))}
              </div>
            </DetailRow>
          )}

          {book.description && (
            <DetailRow label="Sinopse">
              <p className="whitespace-pre-wrap text-muted-foreground leading-relaxed">
                {book.description}
              </p>
            </DetailRow>
          )}

          {book.notes?.trim() && (
            <DetailRow label="O que você achou?">
              <p className="whitespace-pre-wrap text-muted-foreground">
                {book.notes}
              </p>
            </DetailRow>
          )}

          {book.status === "read" && (
            <DetailRow label="Recomendação">
              {recommend ? "Recomendaria" : "Não recomendaria"}
            </DetailRow>
          )}

          {open && (
            <BookReadingNotes
              book={book}
              editable={book.status === "reading"}
            />
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:flex-wrap sm:justify-end">
          {onDelete && (
            <ConfirmDeleteDialog
              title="Excluir este livro?"
              description={`"${book.title}" será removido da sua lista.`}
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
          {onShare && book.status === "read" && (
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
              {book.status === "to_read" ? (
                <>
                  <BookOpen className="mr-2 h-4 w-4" />
                  {editLabel}
                </>
              ) : book.status === "reading" ? (
                <>
                  <Bookmark className="mr-2 h-4 w-4" />
                  {editLabel}
                </>
              ) : (
                <>
                  <Pencil className="mr-2 h-4 w-4" />
                  {editLabel}
                </>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
