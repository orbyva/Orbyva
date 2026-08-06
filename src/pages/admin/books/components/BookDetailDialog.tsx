import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Bookmark,
  BookOpen,
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
import { Input } from "@/components/ui/input";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { ScoreRating } from "@/components/ScoreRating";
import {
  StatusPill,
  type StatusPillTone,
} from "@/components/StatusPill";
import { FORM_DIALOG_CONTENT_CLASS } from "@/components/FormLabel";
import { updateBook } from "@/api/books";
import {
  BOOK_STATUS_LABELS,
  formatAuthors,
  formatBookRating,
  getBookRatingLabel,
  getLatestReadDate,
  getReadingProgress,
  parsePageInput,
} from "@/domain/books";
import type { Book, BookStatus } from "@/types/books";
import { formatDateBR } from "@/lib/currency";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { BookEditIntent } from "./BookEditModal";
import { BookReadingNotes } from "./BookReadingNotes";

interface BookDetailDialogProps {
  book: Book | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: (intent?: BookEditIntent) => void;
  onShare?: () => void;
  onDelete?: () => void;
  onBookPatch?: (patch: Partial<Book>) => void;
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

function bookStatusTone(status: BookStatus): StatusPillTone {
  switch (status) {
    case "to_read":
      return "warning";
    case "reading":
      return "primary";
    case "read":
      return "success";
    case "abandoned":
      return "muted";
    default:
      return "muted";
  }
}

function ReadingLifecycleLinks({
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

function BookmarkEditor({
  book,
  onBookPatch,
  onFinish,
  onAbandon,
}: {
  book: Book;
  onBookPatch?: (patch: Partial<Book>) => void;
  onFinish?: () => void;
  onAbandon?: () => void;
}) {
  const { toast } = useToast();
  const [page, setPage] = useState(
    book.current_page != null ? String(book.current_page) : ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const lastSaved = useRef(book.current_page ?? null);

  useEffect(() => {
    setPage(book.current_page != null ? String(book.current_page) : "");
    lastSaved.current = book.current_page ?? null;
    setError("");
  }, [book.google_id, book.current_page]);

  const progress = getReadingProgress({
    current_page: parsePageInput(page) ?? book.current_page,
    page_count: book.page_count,
  });

  async function save() {
    setError("");
    const raw = page.trim();
    const next = raw === "" ? null : parsePageInput(page);
    if (raw !== "" && next == null) {
      setError("Informe uma página válida.");
      return;
    }
    if (
      next != null &&
      book.page_count != null &&
      book.page_count > 0 &&
      next > book.page_count
    ) {
      setError(`Máximo: ${book.page_count} páginas.`);
      return;
    }
    if (next === lastSaved.current) return;

    setSaving(true);
    try {
      await updateBook({
        google_id: book.google_id,
        current_page: next,
        status: "reading",
      });
      lastSaved.current = next;
      onBookPatch?.({ current_page: next });
    } catch (err) {
      toast({
        title: "Erro",
        description: getErrorMessage(err, "Falha ao salvar marca-página."),
        variant: "destructive",
        duration: 2000,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <DetailRow label="Marca-página">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Bookmark className="h-3.5 w-3.5 shrink-0 text-primary" />
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              max={book.page_count ?? undefined}
              className="h-8 w-24"
              placeholder="Pág."
              value={page}
              disabled={saving}
              onChange={(e) => setPage(e.target.value)}
              onBlur={() => void save()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.currentTarget.blur();
                }
              }}
              aria-label="Página atual"
            />
            {book.page_count != null && book.page_count > 0 ? (
              <span className="text-sm text-muted-foreground">
                de {book.page_count}
                {progress != null ? ` · ${progress}%` : ""}
              </span>
            ) : saving ? (
              <span className="text-xs text-muted-foreground">Salvando…</span>
            ) : null}
          </div>
        </div>
        {progress != null && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
        {error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Salva ao sair do campo — onde você parou.
          </p>
        )}
        {onFinish && onAbandon ? (
          <ReadingLifecycleLinks onFinish={onFinish} onAbandon={onAbandon} />
        ) : null}
      </div>
    </DetailRow>
  );
}

export function BookDetailDialog({
  book,
  open,
  onOpenChange,
  onEdit,
  onShare,
  onDelete,
  onBookPatch,
}: BookDetailDialogProps) {
  const { toast } = useToast();
  const [favoriteBusy, setFavoriteBusy] = useState(false);

  if (!book) return null;

  const latest = getLatestReadDate(book.read_dates);
  const recommend = book.would_recommend !== false;
  const favorited = book.is_favorite === true;
  const bookId = book.google_id;

  function openEdit(intent?: BookEditIntent) {
    onOpenChange(false);
    onEdit?.(intent);
  }

  async function handleToggleFavorite() {
    if (favoriteBusy) return;
    const next = !favorited;
    setFavoriteBusy(true);
    onBookPatch?.({ is_favorite: next });
    try {
      await updateBook({ google_id: bookId, is_favorite: next });
    } catch (error) {
      onBookPatch?.({ is_favorite: favorited });
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
              <div className="flex items-start gap-2">
                <DialogTitle className="min-w-0 flex-1 text-left leading-snug">
                  {book.title}
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
                <StatusPill tone={bookStatusTone(book.status)}>
                  {BOOK_STATUS_LABELS[book.status]}
                </StatusPill>
                {book.status === "read" ? (
                  recommend ? (
                    <ThumbsUp className="h-3.5 w-3.5 shrink-0 text-success" />
                  ) : (
                    <ThumbsDown className="h-3.5 w-3.5 shrink-0 text-destructive" />
                  )
                ) : null}
              </div>
              <p className="text-sm text-muted-foreground">
                {formatAuthors(book.authors)}
                {book.published_year != null
                  ? ` · ${book.published_year}`
                  : ""}
              </p>
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
            <BookmarkEditor
              book={book}
              onBookPatch={onBookPatch}
              onFinish={onEdit ? () => openEdit("finish") : undefined}
              onAbandon={onEdit ? () => openEdit("abandon") : undefined}
            />
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
                  <StatusPill key={c} tone="muted">
                    {c}
                  </StatusPill>
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
          {onEdit && book.status !== "reading" && (
            <Button onClick={() => openEdit()}>
              {book.status === "to_read" ? (
                <>
                  <BookOpen className="mr-2 h-4 w-4" />
                  Começar
                </>
              ) : book.status === "abandoned" ? (
                <>
                  <BookOpen className="mr-2 h-4 w-4" />
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
