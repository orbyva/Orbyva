import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { createBook } from "@/api/books";
import type { BookCreateRequest, BookStatus } from "@/types/books";
import { useToast } from "@/hooks/use-toast";
import { DatePicker } from "@/components/DatePicker";
import { ScoreRating } from "@/components/ScoreRating";
import { FormField, FormFieldRow } from "@/components/FormField";
import { FormDialogShell, FormFooter } from "@/components/FormDialogShell";
import { FormSection } from "@/components/FormSection";
import { Separator } from "@/components/ui/separator";
import {
  formatBookRating,
  getBookRatingLabel,
  newManualBookId,
} from "@/domain/books";
import { formatLocalIsoDate } from "@/domain/entertainment/insights";
import { getErrorMessage } from "@/lib/errors";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUS_OPTIONS: { value: BookStatus; label: string }[] = [
  { value: "to_read", label: "Quero ler" },
  { value: "reading", label: "Lendo" },
  { value: "read", label: "Li" },
];

/** Um livro impresso hoje não é de antes da imprensa; pega erro de digitação. */
const MIN_YEAR = 1450;

interface BookManualModalProps {
  onBookAdded: () => void;
  /** Pré-preenche ao abrir (ex.: o texto que a pessoa buscou no catálogo). */
  initialTitle?: string;
  initialAuthors?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Esconde o botão interno; o pai controla a abertura. */
  hideTrigger?: boolean;
  triggerLabel?: string;
  triggerVariant?: "default" | "outline" | "secondary" | "ghost";
  triggerClassName?: string;
}

/**
 * Cadastro de livro fora do Google Books — lançamento recente, autoedição ou
 * edição brasileira ausente do catálogo. Espelha `AlbumManualModal`.
 *
 * A capa é por URL: não existe bucket `book-covers` no Storage, e criar um
 * exigiria migration. Quem não tiver a URL fica sem capa, que é melhor do que
 * não conseguir cadastrar.
 */
export function BookManualModal({
  onBookAdded,
  initialTitle = "",
  initialAuthors = "",
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
  triggerLabel = "Adicionar livro manualmente",
  triggerVariant = "outline",
  triggerClassName = "w-full gap-2",
}: BookManualModalProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isOpen = controlledOpen ?? uncontrolledOpen;

  function setIsOpen(next: boolean) {
    if (onOpenChange) onOpenChange(next);
    else setUncontrolledOpen(next);
  }

  const [title, setTitle] = useState(initialTitle);
  const [authors, setAuthors] = useState(initialAuthors);
  const [year, setYear] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [pageCount, setPageCount] = useState("");
  const [status, setStatus] = useState<BookStatus>("to_read");
  const [currentPage, setCurrentPage] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [readDate, setReadDate] = useState<Date>();
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);

  // Reabrir com outra busca tem de refletir o novo texto, não o anterior.
  useEffect(() => {
    if (isOpen) {
      setTitle(initialTitle);
      setAuthors(initialAuthors);
    }
  }, [isOpen, initialTitle, initialAuthors]);

  function resetState() {
    setTitle("");
    setAuthors("");
    setYear("");
    setCoverUrl("");
    setPageCount("");
    setStatus("to_read");
    setCurrentPage("");
    setRating(null);
    setNotes("");
    setReadDate(undefined);
    setFormError("");
  }

  async function handleSave() {
    if (!title.trim()) {
      setFormError("Informe o título do livro.");
      return;
    }

    const yearNum = year.trim() ? Number(year.trim()) : null;
    if (
      year.trim() &&
      (!Number.isFinite(yearNum) ||
        (yearNum ?? 0) < MIN_YEAR ||
        (yearNum ?? 0) > new Date().getFullYear() + 1)
    ) {
      setFormError("Ano inválido.");
      return;
    }

    const pagesNum = pageCount.trim() ? Number(pageCount.trim()) : null;
    if (pageCount.trim() && (!Number.isFinite(pagesNum) || (pagesNum ?? 0) < 1)) {
      setFormError("Número de páginas inválido.");
      return;
    }

    const currentNum = currentPage.trim() ? Number(currentPage.trim()) : null;
    if (status === "reading" && currentNum != null) {
      if (!Number.isFinite(currentNum) || currentNum < 0) {
        setFormError("Página atual inválida.");
        return;
      }
      if (pagesNum != null && currentNum > pagesNum) {
        setFormError("A página atual não pode passar do total.");
        return;
      }
    }

    if (status === "read" && !readDate) {
      setFormError("Informe a data em que leu.");
      return;
    }

    setFormError("");
    setLoading(true);

    const payload: BookCreateRequest = {
      google_id: newManualBookId(),
      title: title.trim(),
      authors: authors
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean),
      published_year: yearNum,
      cover_url: coverUrl.trim() || null,
      categories: [],
      description: null,
      page_count: pagesNum,
      publisher: null,
      isbn13: null,
      status,
      current_page: status === "reading" ? currentNum : null,
      rating: status === "read" ? rating : null,
      notes: status === "read" ? notes.trim() || null : null,
      would_recommend: true,
      is_favorite: false,
      read_dates:
        status === "read" && readDate ? [formatLocalIsoDate(readDate)] : [],
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
    } finally {
      setLoading(false);
    }
  }

  const { toast } = useToast();

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {hideTrigger ? null : (
        <DialogTrigger asChild>
          <Button
            type="button"
            variant={triggerVariant}
            className={triggerClassName}
          >
            <Plus className="h-4 w-4" />
            {triggerLabel}
          </Button>
        </DialogTrigger>
      )}

      <FormDialogShell
        title="Adicionar livro manualmente"
        description="Pra livros que o Google Books não tem — lançamento recente, autoedição ou edição fora do catálogo."
        errorSummary={formError || undefined}
        footer={
          <FormFooter
            onCancel={() => setIsOpen(false)}
            onSubmit={() => void handleSave()}
            submitLabel="Adicionar"
            loading={loading}
          />
        }
      >
        <FormSection title="Livro">
          <FormField label="Título" required>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Inteligência Pragmática"
              autoFocus
            />
          </FormField>

          <FormField label="Autores" hint="Separe por vírgula">
            <Input
              value={authors}
              onChange={(e) => setAuthors(e.target.value)}
              placeholder="Max Peters"
            />
          </FormField>

          <FormFieldRow>
            <FormField label="Ano" optional>
              <Input
                value={year}
                onChange={(e) => setYear(e.target.value)}
                inputMode="numeric"
                placeholder="2026"
              />
            </FormField>
            <FormField label="Páginas" optional>
              <Input
                value={pageCount}
                onChange={(e) => setPageCount(e.target.value)}
                inputMode="numeric"
                placeholder="320"
              />
            </FormField>
          </FormFieldRow>

          <FormField label="Capa" optional hint="URL de uma imagem">
            <Input
              value={coverUrl}
              onChange={(e) => setCoverUrl(e.target.value)}
              placeholder="https://…"
            />
          </FormField>
        </FormSection>

        <Separator />

        <FormSection title="Situação">
          <FormField label="Status" required>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as BookStatus)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          {status === "reading" && (
            <FormField label="Página atual" optional>
              <Input
                value={currentPage}
                onChange={(e) => setCurrentPage(e.target.value)}
                inputMode="numeric"
                placeholder="42"
              />
            </FormField>
          )}

          {status === "read" && (
            <>
              <FormField label="Data em que leu" required>
                <DatePicker date={readDate} onSelect={setReadDate} />
              </FormField>

              <FormField
                label="Nota"
                optional
                hint={
                  rating != null && rating > 0
                    ? `${formatBookRating(rating)}/10 - ${getBookRatingLabel(rating)} · clique na metade esquerda para meia nota`
                    : undefined
                }
              >
                <ScoreRating value={rating} onChange={setRating} />
              </FormField>

              <FormField label="Comentário" optional>
                <textarea
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  placeholder="Sua opinião..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </FormField>
            </>
          )}
        </FormSection>
      </FormDialogShell>
    </Dialog>
  );
}
