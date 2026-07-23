import { useRef, useState } from "react";
import { Download, FileUp, Loader2 } from "lucide-react";
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
import { createTransactionApi, fetchClasses } from "@/api/finance";
import {
  downloadFinanceImportTemplate,
  financeImportToCreateRequest,
  parseFinanceImportCsv,
  resolveFinanceImportRows,
  type FinanceImportRow,
} from "@/lib/financeImport";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { track } from "@/lib/analytics";

interface FinanceImportDialogProps {
  onImported: () => void;
}

export function FinanceImportDialog({ onImported }: FinanceImportDialogProps) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<FinanceImportRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  function reset() {
    setRows([]);
    setParseErrors([]);
    setProgress({ done: 0, total: 0 });
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleFile(file: File) {
    const text = await file.text();
    const parsed = parseFinanceImportCsv(text);
    if (!parsed.rows.length) {
      setRows([]);
      setParseErrors(parsed.errors);
      toast({
        title: "Nada para importar",
        description: parsed.errors[0] ?? "CSV sem linhas válidas.",
        variant: "destructive",
      });
      return;
    }

    try {
      const classes = await fetchClasses();
      const resolved = resolveFinanceImportRows(parsed.rows, classes);
      setRows(resolved.ready);
      setParseErrors([...parsed.errors, ...resolved.errors]);
      if (!resolved.ready.length) {
        toast({
          title: "Nenhuma linha resolvida",
          description:
            resolved.errors[0] ??
            "Confira se as classes existem em Dimensões.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Falha ao ler classes",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    }
  }

  async function handleImport() {
    if (!rows.length) return;
    setImporting(true);
    setProgress({ done: 0, total: rows.length });
    track("finance_import_start", { count: rows.length });

    let ok = 0;
    let failed = 0;

    for (let i = 0; i < rows.length; i++) {
      try {
        await createTransactionApi(financeImportToCreateRequest(rows[i]));
        ok++;
      } catch {
        failed++;
      }
      setProgress({ done: i + 1, total: rows.length });
    }

    setImporting(false);
    track("finance_import_done", { ok, failed });
    toast({
      title: "Importação concluída",
      description: `${ok} importada(s) · ${failed} falha(s)`,
      duration: 3500,
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
          <DialogTitle>Importar transações (CSV)</DialogTitle>
        </DialogHeader>

        <div className={FORM_FIELDS_CLASS}>
          <p className="text-sm text-muted-foreground">
            Use o modelo Orbyva (mesmo formato do export): data, descricao,
            valor, classe. Tipo e natureza ajudam se houver classes com o mesmo
            nome.
          </p>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-fit px-0"
            onClick={() => downloadFinanceImportTemplate()}
          >
            <Download className="mr-2 h-4 w-4" />
            Baixar modelo CSV
          </Button>

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

          {parseErrors.slice(0, 8).map((err) => (
            <p key={err} className="text-sm text-destructive">
              {err}
            </p>
          ))}
          {parseErrors.length > 8 ? (
            <p className="text-xs text-muted-foreground">
              …e mais {parseErrors.length - 8} aviso(s)
            </p>
          ) : null}

          {preview.length > 0 && (
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2 text-sm">
              {preview.map((row) => (
                <div
                  key={`${row.line}-${row.descricao}`}
                  className="flex justify-between gap-2 border-b border-border/40 py-1 last:border-0"
                >
                  <span className="truncate">
                    {row.data} · {row.descricao}
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {row.classe}
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
            {importing ? "Importando..." : `Importar ${rows.length || ""}`.trim()}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
