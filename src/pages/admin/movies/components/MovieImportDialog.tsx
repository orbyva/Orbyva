import { useRef, useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  FormLabel,
  FORM_DIALOG_CONTENT_CLASS,
  FORM_FIELDS_CLASS,
} from "@/components/FormLabel";
import { upsertMovie } from "@/api/movies";
import { findMovieByTitleYear } from "@/lib/omdb";
import {
  parseMovieImportCsv,
  type ImportedWatch,
  type ImportSource,
} from "@/lib/movieImport";
import { MovieStatus, type MovieCreateRequest } from "@/types/movies";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";

interface MovieImportDialogProps {
  onImported: () => void;
}

const SOURCE_LABEL: Record<ImportSource, string> = {
  letterboxd: "Letterboxd",
  tvtime: "TV Time",
  generic: "CSV genérico",
};

export function MovieImportDialog({ onImported }: MovieImportDialogProps) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ImportedWatch[]>([]);
  const [source, setSource] = useState<ImportSource | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  function reset() {
    setRows([]);
    setSource(null);
    setParseErrors([]);
    setProgress({ done: 0, total: 0 });
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleFile(file: File) {
    const text = await file.text();
    const result = parseMovieImportCsv(text);
    setSource(result.source);
    setParseErrors(result.errors);
    setRows(result.rows);
    if (result.rows.length === 0) {
      toast({
        title: "Nada para importar",
        description: result.errors[0] ?? "CSV sem linhas válidas.",
        variant: "destructive",
      });
    }
  }

  async function handleImport() {
    if (!rows.length) return;
    setImporting(true);
    setProgress({ done: 0, total: rows.length });

    let created = 0;
    let updated = 0;
    let failed = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const found = await findMovieByTitleYear(row.title, row.year);
        if (!found) {
          failed++;
        } else {
          const payload: MovieCreateRequest = {
            ...found,
            status: MovieStatus.WATCHED,
            rating: row.rating,
            notes: row.notes,
            would_recommend: true,
            watched_dates: row.watchedDate ? [row.watchedDate] : [],
          };
          const result = await upsertMovie(payload);
          if (result === "created") created++;
          else updated++;
        }
      } catch {
        failed++;
      }
      setProgress({ done: i + 1, total: rows.length });
      await sleep(320);
    }

    setImporting(false);
    toast({
      title: "Importação concluída",
      description: `${created} novos · ${updated} atualizados · ${failed} não encontrados`,
      duration: 4000,
    });
    setOpen(false);
    reset();
    onImported();
  }

  const preview = rows.slice(0, 40);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full gap-2 sm:w-auto">
          <FileUp className="h-4 w-4" />
          Importar
        </Button>
      </DialogTrigger>

      <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
        <DialogHeader>
          <DialogTitle>Importar lista</DialogTitle>
        </DialogHeader>

        <div className={FORM_FIELDS_CLASS}>
          <p className="text-sm text-muted-foreground">
            Aceita CSV do Letterboxd (diary/ratings), backups estilo TV Time ou
            um CSV genérico com Title/Name, Year, Rating e Watched Date.
          </p>

          <div>
            <FormLabel required>Arquivo CSV</FormLabel>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
          </div>

          {source && (
            <p className="text-xs text-muted-foreground">
              Fonte detectada: {SOURCE_LABEL[source]} · {rows.length} título(s)
            </p>
          )}

          {parseErrors.map((err) => (
            <p key={err} className="text-sm text-destructive">
              {err}
            </p>
          ))}

          {preview.length > 0 && (
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2 text-sm">
              {preview.map((row, idx) => (
                <div
                  key={`${row.title}-${idx}`}
                  className="flex justify-between gap-2 border-b border-border/40 py-1 last:border-0"
                >
                  <span className="truncate">
                    {row.title}
                    {row.year ? ` (${row.year})` : ""}
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {row.rating != null ? `${row.rating}/10` : "—"}
                  </span>
                </div>
              ))}
              {rows.length > preview.length && (
                <p className="pt-1 text-xs text-muted-foreground">
                  …e mais {rows.length - preview.length}
                </p>
              )}
            </div>
          )}

          {importing && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Importando {progress.done}/{progress.total}…
            </p>
          )}

          <Button
            onClick={() => {
              void handleImport().catch((e) => {
                toast({
                  title: "Erro",
                  description: getErrorMessage(e),
                  variant: "destructive",
                });
                setImporting(false);
              });
            }}
            disabled={!rows.length || importing}
            className="w-full"
          >
            {importing ? "Importando..." : "Importar para FinTrack"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
