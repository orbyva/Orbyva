import { useCallback, useEffect, useState } from "react";
import { MessageSquarePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createBookNote,
  deleteBookNote,
  fetchBookNotes,
} from "@/api/books";
import type { Book, BookNote } from "@/types/books";
import { parsePageInput } from "@/domain/books";
import { formatDateBR } from "@/lib/currency";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/hooks/use-toast";
import { FormLabel } from "@/components/FormLabel";

interface BookReadingNotesProps {
  book: Book;
  /** Só edição ativa em `reading`; em outros status só lista. */
  editable?: boolean;
}

export function BookReadingNotes({
  book,
  editable = false,
}: BookReadingNotesProps) {
  const [notes, setNotes] = useState<BookNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [page, setPage] = useState(
    book.current_page != null ? String(book.current_page) : ""
  );
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setNotes(await fetchBookNotes(book.google_id));
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Falha ao carregar comentários."),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [book.google_id, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (book.current_page != null) {
      setPage(String(book.current_page));
    }
  }, [book.current_page]);

  async function handleAdd() {
    const text = body.trim();
    if (!text) {
      toast({
        title: "Escreva um comentário",
        variant: "destructive",
        duration: 2000,
      });
      return;
    }
    const pageNum = page.trim() ? parsePageInput(page) : null;
    if (page.trim() && pageNum == null) {
      toast({
        title: "Página inválida",
        variant: "destructive",
        duration: 2000,
      });
      return;
    }

    setSaving(true);
    try {
      await createBookNote({
        google_id: book.google_id,
        page: pageNum,
        body: text,
      });
      setBody("");
      await load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Falha ao salvar."),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteBookNote(id);
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Falha ao excluir."),
        variant: "destructive",
      });
    }
  }

  if (!editable && notes.length === 0 && !loading) return null;

  return (
    <div className="space-y-3 border-t pt-4">
      <p className="text-xs font-medium text-muted-foreground">
        Comentários na leitura
      </p>

      {editable && (
        <div className="space-y-2 rounded-lg border p-3">
          <div className="flex gap-2">
            <div className="w-24 flex-none">
              <FormLabel optional>Pág.</FormLabel>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                value={page}
                onChange={(e) => setPage(e.target.value)}
                placeholder="·"
              />
            </div>
            <div className="min-w-0 flex-1">
              <FormLabel optional>Comentário</FormLabel>
              <textarea
                className="flex min-h-[64px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="Uma frase sobre o que está lendo…"
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            disabled={saving}
            onClick={() => void handleAdd()}
          >
            <MessageSquarePlus className="h-3.5 w-3.5" />
            {saving ? "Salvando…" : "Adicionar"}
          </Button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : notes.length === 0 ? (
        editable ? (
          <p className="text-sm text-muted-foreground">
            Nenhum comentário ainda.
          </p>
        ) : null
      ) : (
        <ul className="space-y-2">
          {notes.map((note) => (
            <li
              key={note.id}
              className="group rounded-md border bg-muted/30 px-3 py-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 space-y-1">
                  <p className="text-[11px] text-muted-foreground">
                    {note.page != null ? `Pág. ${note.page} · ` : ""}
                    {formatDateBR(note.created_at.slice(0, 10))}
                  </p>
                  <p className="whitespace-pre-wrap text-sm">{note.body}</p>
                </div>
                {editable && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 flex-none text-destructive opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                    aria-label="Excluir comentário"
                    onClick={() => void handleDelete(note.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
