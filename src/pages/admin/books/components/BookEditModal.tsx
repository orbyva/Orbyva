import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { updateBook } from "@/api/books";
import type { Book, BookStatus, BookUpdateRequest } from "@/types/books";
import { useToast } from "@/hooks/use-toast";
import { DatePicker } from "@/components/DatePicker";
import { ScoreRating } from "@/components/ScoreRating";
import {
  FormLabel,
  FORM_DIALOG_CONTENT_CLASS,
  FORM_FIELDS_CLASS,
} from "@/components/FormLabel";
import {
  BOOK_STATUS_LABELS,
  formatAuthors,
  formatBookRating,
  getBookRatingLabel,
  parsePageInput,
} from "@/domain/books";
import {
  formatLocalIsoDate,
  normalizeEntertainmentDates,
} from "@/domain/entertainment/insights";
import { getErrorMessage } from "@/lib/errors";

interface BookEditModalProps {
  book: Book;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBookUpdated: () => void;
  /** Intent inicial ao abrir (ex.: Terminei / Abandonei no detalhe). */
  initialIntent?: BookEditIntent | null;
}

function normalizeReadDates(dates: Book["read_dates"]): string[] {
  return normalizeEntertainmentDates(dates);
}

type EditIntent = "bookmark" | "finish" | "abandon" | "resume" | "start";

export type BookEditIntent = EditIntent;

export function BookEditModal({
  book,
  open,
  onOpenChange,
  onBookUpdated,
  initialIntent = null,
}: BookEditModalProps) {
  const [intent, setIntent] = useState<EditIntent>("finish");
  const [rating, setRating] = useState<number | null>(book.rating ?? null);
  const [notes, setNotes] = useState(book.notes ?? "");
  const [wouldRecommend, setWouldRecommend] = useState(
    book.would_recommend !== false
  );
  const [readDate, setReadDate] = useState<Date | undefined>();
  const [currentPage, setCurrentPage] = useState(
    book.current_page != null ? String(book.current_page) : ""
  );
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    setRating(book.rating ?? null);
    setNotes(book.notes ?? "");
    setWouldRecommend(book.would_recommend !== false);
    setReadDate(undefined);
    setCurrentPage(book.current_page != null ? String(book.current_page) : "");
    setFormError("");
    if (initialIntent) {
      setIntent(initialIntent);
    } else if (book.status === "to_read") {
      setIntent("start");
    } else if (book.status === "reading") {
      setIntent("finish");
    } else if (book.status === "abandoned") {
      setIntent("resume");
    } else {
      setIntent("finish");
    }
  }, [open, book, initialIntent]);

  function parsePageOrError(): number | null | undefined {
    if (!currentPage.trim()) return null;
    const page = parsePageInput(currentPage);
    if (page == null) {
      setFormError("Informe uma página válida (número inteiro ≥ 0).");
      return undefined;
    }
    if (
      book.page_count != null &&
      book.page_count > 0 &&
      page > book.page_count
    ) {
      setFormError(
        `A marca-página não pode passar de ${book.page_count} páginas.`
      );
      return undefined;
    }
    return page;
  }

  async function handleSave() {
    setFormError("");

    try {
      setLoading(true);
      const updateData: BookUpdateRequest = { google_id: book.google_id };

      if (intent === "start") {
        const page = parsePageOrError();
        if (page === undefined) return;
        updateData.status = "reading";
        updateData.current_page = page;
      } else if (intent === "bookmark") {
        const page = parsePageOrError();
        if (page === undefined) return;
        updateData.current_page = page;
        updateData.status = "reading";
      } else if (intent === "resume") {
        const page = parsePageOrError();
        if (page === undefined) return;
        updateData.status = "reading";
        updateData.current_page = page;
      } else if (intent === "abandon") {
        updateData.status = "abandoned";
      } else if (intent === "finish") {
        if (book.status !== "read" && !readDate) {
          setFormError("Informe a data em que leu.");
          return;
        }
        updateData.rating = rating;
        updateData.notes = notes.trim() || null;
        updateData.would_recommend = wouldRecommend;
        updateData.status = "read";
        if (readDate) {
          const nextDate = formatLocalIsoDate(readDate);
          updateData.read_dates = [
            ...normalizeReadDates(book.read_dates),
            nextDate,
          ];
        }
        if (book.page_count != null && book.page_count > 0) {
          updateData.current_page = book.page_count;
        }
      }

      await updateBook(updateData);

      const messages: Record<EditIntent, string> = {
        start: "Começou a ler!",
        bookmark: "Marca-página salva!",
        finish:
          book.status === "read" ? "Opinião atualizada!" : "Opinião registrada!",
        abandon: "Marcado como abandonado.",
        resume: "De volta à leitura!",
      };

      toast({
        title: "Sucesso",
        description: messages[intent],
        duration: 2000,
      });

      onOpenChange(false);
      onBookUpdated();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Falha ao atualizar livro."),
        variant: "destructive",
        duration: 2000,
      });
    } finally {
      setLoading(false);
    }
  }

  const title =
    intent === "start"
      ? "Começar a ler"
      : intent === "abandon"
        ? "Abandonar livro"
        : intent === "resume"
          ? "Retomar leitura"
          : book.status === "read"
            ? "Editar opinião"
            : "Avaliar livro";

  const showPageField = intent === "start" || intent === "resume";
  const showFinishFields = intent === "finish";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
        <DialogTitle>{title}</DialogTitle>

        <div className="flex items-start gap-3 sm:gap-4">
          <img
            src={book.cover_url || "/placeholder.svg"}
            alt={book.title}
            className="h-20 w-14 flex-none rounded object-cover sm:h-24 sm:w-16"
            referrerPolicy="no-referrer"
          />
          <div className="min-w-0">
            <h3 className="truncate text-base font-medium sm:text-lg">
              {book.title}
              {book.published_year ? ` (${book.published_year})` : ""}
            </h3>
            <p className="truncate text-sm text-muted-foreground">
              {formatAuthors(book.authors)}
            </p>
            <p className="text-xs text-muted-foreground">
              {BOOK_STATUS_LABELS[book.status as BookStatus]}
              {book.page_count != null && book.page_count > 0
                ? ` · ${book.page_count} páginas`
                : ""}
            </p>
          </div>
        </div>

        <div className={FORM_FIELDS_CLASS}>
          {(book.status === "to_read" ||
            book.status === "reading" ||
            book.status === "abandoned") && (
            <div className="flex flex-wrap gap-2">
              {book.status === "to_read" && (
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
                    variant={intent === "abandon" ? "default" : "outline"}
                    onClick={() => setIntent("abandon")}
                  >
                    Abandonar
                  </Button>
                </>
              )}
              {book.status === "reading" && (
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
              {book.status === "abandoned" && (
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

          {showPageField && (
            <div>
              <FormLabel optional>Página atual</FormLabel>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={book.page_count ?? undefined}
                placeholder={
                  book.page_count
                    ? `Ex.: 42 (de ${book.page_count})`
                    : "Ex.: 42"
                }
                value={currentPage}
                onChange={(e) => setCurrentPage(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Onde você parou — seu marca-página digital.
              </p>
            </div>
          )}

          {intent === "abandon" && (
            <p className="text-sm text-muted-foreground">
              O livro vai para a aba Abandonei. Você pode retomar depois.
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
                      {formatBookRating(rating)}/10 —{" "}
                      {getBookRatingLabel(rating)} · clique na metade esquerda
                      para meia nota
                    </p>
                  )}
                </div>
              </div>

              <div>
                <FormLabel
                  required={book.status !== "read"}
                  optional={book.status === "read"}
                >
                  {book.status === "read"
                    ? "Nova data de leitura"
                    : "Data da leitura"}
                </FormLabel>
                <DatePicker
                  date={readDate}
                  onSelect={setReadDate}
                  placeholder="Selecione a data"
                />
              </div>

              <div>
                <FormLabel optional>O que achou?</FormLabel>
                <textarea
                  className="flex min-h-[88px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  placeholder="Final, escrita, vibe, spoilers livres..."
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
                      : book.status === "read"
                        ? "Salvar alterações"
                        : "Salvar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
