import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  fetchGoogleBookById,
  isGoogleBooksConfigured,
  searchGoogleBooks,
  type BookSearchHit,
} from "@/lib/googleBooks";
import { createBook } from "@/api/books";
import type { Book, BookCreateRequest } from "@/types/books";
import { Loader2, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DatePicker } from "@/components/DatePicker";
import { ScoreRating } from "@/components/ScoreRating";
import {
  FormLabel,
  FORM_DIALOG_CONTENT_CLASS,
  FORM_FIELDS_CLASS,
} from "@/components/FormLabel";
import {
  formatAuthors,
  formatBookRating,
  getBookRatingLabel,
} from "@/domain/books";
import { formatLocalIsoDate } from "@/domain/entertainment/insights";
import { getErrorMessage } from "@/lib/errors";
import {
  isAbortError,
  useTypeaheadSearch,
} from "@/hooks/useTypeaheadSearch";

interface BookSearchModalProps {
  onBookAdded: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}

export function BookSearchModal({
  onBookAdded,
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
}: BookSearchModalProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : uncontrolledOpen;

  function setIsOpen(next: boolean) {
    if (!isControlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  }
  const [step, setStep] = useState<"search" | "details">("search");
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<BookSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [wouldRecommend, setWouldRecommend] = useState(true);
  const [readDate, setReadDate] = useState<Date>();
  const [formError, setFormError] = useState("");
  const [status, setStatus] = useState<"to_read" | "reading" | "read">(
    "to_read"
  );
  const { toast } = useToast();

  const clearSearchResults = useCallback(() => {
    setSearchResults([]);
    setFormError("");
    setLoading(false);
  }, []);

  const runTypeahead = useCallback(async (q: string, signal: AbortSignal) => {
    setFormError("");
    setLoading(true);
    try {
      if (!isGoogleBooksConfigured()) {
        if (signal.aborted) return;
        setFormError(
          "Busca de livros temporariamente indisponível. Tente mais tarde."
        );
        return;
      }
      const results = await searchGoogleBooks(q);
      if (signal.aborted) return;
      setSearchResults(results);
      if (results.length === 0) {
        setFormError("Nenhum livro encontrado. Tente outro termo.");
      }
    } catch (error) {
      if (signal.aborted || isAbortError(error)) return;
      setSearchResults([]);
      setFormError(getErrorMessage(error, "Falha na busca."));
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, []);

  useTypeaheadSearch({
    query,
    enabled: isOpen && step === "search",
    run: runTypeahead,
    onClear: clearSearchResults,
  });

  async function handleSelectBook(hit: BookSearchHit) {
    setLoading(true);
    try {
      const full = await fetchGoogleBookById(hit.google_id);
      if (!full) {
        toast({
          title: "Erro",
          description: "Falha ao buscar detalhes do livro.",
          variant: "destructive",
          duration: 2000,
        });
        return;
      }
      setSelectedBook(full);
      setStep("details");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveBook() {
    if (!selectedBook) return;

    if (status === "read" && !readDate) {
      setFormError("Informe a data em que leu.");
      return;
    }

    setFormError("");

    const payload: BookCreateRequest = {
      ...selectedBook,
      status,
      current_page: status === "reading" ? selectedBook.current_page : null,
      rating: status === "read" ? rating : null,
      notes: status === "read" ? notes.trim() || null : null,
      would_recommend: status === "read" ? wouldRecommend : true,
      read_dates:
        status === "read" && readDate
          ? [formatLocalIsoDate(readDate)]
          : [],
    };

    try {
      await createBook(payload);

      toast({
        title: "Sucesso",
        description: "Livro adicionado!",
        duration: 2000,
      });

      resetState();
      setIsOpen(false);
      onBookAdded();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Falha ao adicionar."),
        variant: "destructive",
        duration: 2000,
      });
    }
  }

  function resetState() {
    setStep("search");
    setQuery("");
    setSearchResults([]);
    setSelectedBook(null);
    setRating(null);
    setNotes("");
    setWouldRecommend(true);
    setReadDate(undefined);
    setStatus("to_read");
    setFormError("");
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) resetState();
      }}
    >
      {!hideTrigger ? (
        <DialogTrigger asChild>
          <Button className="w-full gap-2 sm:w-auto">
            <Plus className="h-4 w-4" />
            Adicionar
          </Button>
        </DialogTrigger>
      ) : null}

      <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
        <DialogTitle>
          {step === "search" ? "Buscar livro" : "Adicionar à lista"}
        </DialogTitle>

        {step === "search" ? (
          <div className={FORM_FIELDS_CLASS}>
            <FormLabel required>Busca</FormLabel>
            <div className="relative">
              <Input
                type="text"
                placeholder="Digite título, autor ou ISBN…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoComplete="off"
              />
              {loading ? (
                <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              Resultados aparecem conforme você digita.
            </p>
            {formError && <p className="text-sm text-destructive">{formError}</p>}

            {searchResults.length > 0 && (
              <div className="max-h-[55vh] space-y-2 overflow-y-auto sm:max-h-[300px]">
                {searchResults.map((hit) => (
                  <div
                    key={hit.google_id}
                    className="flex cursor-pointer items-center gap-3 rounded-md p-2 hover:bg-muted/50"
                    onClick={() => void handleSelectBook(hit)}
                  >
                    <img
                      src={hit.cover_url || "/placeholder.svg"}
                      alt={hit.title}
                      className="h-16 w-12 flex-none rounded object-cover sm:h-14 sm:w-10"
                      referrerPolicy="no-referrer"
                    />
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {hit.title}
                        {hit.published_year ? ` (${hit.published_year})` : ""}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        {formatAuthors(hit.authors)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-start gap-3 sm:gap-4">
              <img
                src={selectedBook?.cover_url || "/placeholder.svg"}
                alt={selectedBook?.title}
                className="h-20 w-14 flex-none rounded object-cover sm:h-24 sm:w-16"
                referrerPolicy="no-referrer"
              />
              <div className="min-w-0">
                <h3 className="truncate text-base font-medium sm:text-lg">
                  {selectedBook?.title}
                  {selectedBook?.published_year
                    ? ` (${selectedBook.published_year})`
                    : ""}
                </h3>
                <p className="truncate text-sm text-muted-foreground">
                  {formatAuthors(selectedBook?.authors ?? [])}
                </p>
                {selectedBook?.description && (
                  <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">
                    {selectedBook.description}
                  </p>
                )}
              </div>
            </div>

            <div className={FORM_FIELDS_CLASS}>
              <FormLabel required>Status</FormLabel>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Button
                  type="button"
                  variant={status === "to_read" ? "default" : "outline"}
                  onClick={() => setStatus("to_read")}
                  className="w-full sm:w-auto"
                >
                  Para ler
                </Button>
                <Button
                  type="button"
                  variant={status === "reading" ? "default" : "outline"}
                  onClick={() => setStatus("reading")}
                  className="w-full sm:w-auto"
                >
                  Lendo
                </Button>
                <Button
                  type="button"
                  variant={status === "read" ? "default" : "outline"}
                  onClick={() => setStatus("read")}
                  className="w-full sm:w-auto"
                >
                  Lido
                </Button>
              </div>

              {status === "read" && (
                <>
                  <div>
                    <FormLabel optional>Nota</FormLabel>
                    <div className="space-y-2">
                      <ScoreRating value={rating} onChange={setRating} />
                      {rating != null && rating > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {formatBookRating(rating)}/10 —{" "}
                          {getBookRatingLabel(rating)}
                        </p>
                      )}
                    </div>
                  </div>

                  <FormLabel required>Data da leitura</FormLabel>
                  <DatePicker date={readDate} onSelect={setReadDate} />

                  <div>
                    <FormLabel optional>O que achou?</FormLabel>
                    <textarea
                      className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      placeholder="Sua opinião..."
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

              {formError && (
                <p className="text-sm text-destructive">{formError}</p>
              )}

              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button
                  variant="outline"
                  className="w-full sm:flex-1"
                  onClick={() => setStep("search")}
                >
                  Voltar
                </Button>
                <Button
                  onClick={() => void handleSaveBook()}
                  disabled={loading}
                  className="w-full sm:flex-1"
                >
                  {loading ? "Salvando…" : "Adicionar à lista"}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
