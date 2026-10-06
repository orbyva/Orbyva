import { useRef, useState } from "react";
import { FileText, Image as ImageIcon, Link2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ASSET_URL_REJECTION_MESSAGES,
  draftDisplayLabel,
  draftSizeBytes,
  fileDraft,
  linkDraft,
  oversizedMessage,
  removeDraft,
  splitOversizedFiles,
  type ActivityAssetDraft,
} from "@/domain/travel/activityAssetDrafts";
import { formatAssetSize } from "@/domain/travel/activityAssets";
import { cn } from "@/lib/utils";

/**
 * A lista de assets que o formulário de **criação** acumula (feature 257) — arquivos e links que só
 * vão ao banco depois de o evento existir e ter id.
 *
 * O componente é **controlado e sem I/O**: ele não sobe arquivo, não insere linha e não conhece
 * `tripId`. Quem grava é `createActivityAssetDrafts`, chamada pelo `TripDetail` logo depois do
 * `createItineraryActivity` — o que é também o que faz "cancelar o formulário" não deixar rastro
 * nenhum no bucket.
 *
 * Por que não reusar o `TripActivityAssetsDialog`: lá cada botão é uma escrita imediata (abrir,
 * renomear, excluir mexem no banco). Aqui não há nada no banco para mexer; a única ação possível é
 * tirar da lista.
 */
export function ActivityAssetDraftsField({
  drafts,
  onChange,
}: {
  drafts: ActivityAssetDraft[];
  onChange: (next: ActivityAssetDraft[]) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [sizeError, setSizeError] = useState<string | null>(null);

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const { accepted, oversized } = splitOversizedFiles(Array.from(files));
    // Os grandes são recusados **sem** derrubar os que cabem: quem escolheu cinco arquivos e errou
    // em um quer os outros quatro.
    setSizeError(oversized.length > 0 ? oversizedMessage(oversized) : null);
    if (accepted.length > 0) {
      onChange([...drafts, ...accepted.map((file) => fileDraft(file))]);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleAddLink() {
    const result = linkDraft(linkUrl, linkLabel);
    if (!result.ok) {
      // A recusa aparece no campo, não num toast: o erro é do que está escrito ali.
      setLinkError(ASSET_URL_REJECTION_MESSAGES[result.reason]);
      return;
    }
    setLinkError(null);
    onChange([...drafts, result.draft]);
    setLinkUrl("");
    setLinkLabel("");
  }

  return (
    <div className="space-y-3">
      {drafts.length > 0 ? (
        <ul className="space-y-2">
          {drafts.map((draft) => {
            const label = draftDisplayLabel(draft);
            const size = formatAssetSize(draftSizeBytes(draft));
            const Icon =
              draft.kind === "link"
                ? Link2
                : draft.file.type.startsWith("image/")
                  ? ImageIcon
                  : FileText;
            return (
              <li
                key={draft.key}
                className="flex items-center gap-2 rounded-lg border bg-card px-2.5 py-2"
              >
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border",
                    draft.kind === "link"
                      ? "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400"
                      : "border-primary/30 bg-primary/10 text-primary"
                  )}
                  aria-hidden
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{label}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {draft.kind === "link" ? "Link" : "Arquivo"}
                    {size ? ` · ${size}` : ""} · anexa ao salvar
                  </span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                  aria-label={`Remover ${label}`}
                  onClick={() => onChange(removeDraft(drafts, draft.key))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          aria-hidden
          tabIndex={-1}
          onChange={(e) => handleFiles(e.target.files)}
        />
        <Button
          type="button"
          variant="outline"
          className="w-full border-dashed"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="mr-1.5 h-4 w-4" />
          Anexar arquivo
        </Button>
        {sizeError ? (
          <p className="mt-1 text-xs text-destructive" role="alert">
            {sizeError}
          </p>
        ) : (
          <p className="mt-1 text-[11px] text-muted-foreground">
            Até 10 MB por arquivo. Só é enviado quando você salvar.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={linkUrl}
            onChange={(e) => {
              setLinkUrl(e.target.value);
              setLinkError(null);
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              // Sem isso, Enter no campo submeteria o formulário do evento em vez de adicionar o
              // link — o campo mora dentro de um diálogo de formulário.
              e.preventDefault();
              handleAddLink();
            }}
            placeholder="https://… (ingresso, reserva, check-in)"
            aria-label="Link do asset"
            aria-invalid={linkError ? true : undefined}
            className="min-w-0 flex-1"
          />
          <Input
            value={linkLabel}
            onChange={(e) => setLinkLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              handleAddLink();
            }}
            placeholder="Nome (opcional)"
            aria-label="Nome do link"
            className="min-w-0 sm:max-w-[11rem]"
          />
        </div>
        {linkError ? (
          <p className="text-xs text-destructive" role="alert">
            {linkError}
          </p>
        ) : null}
        <Button
          type="button"
          variant="outline"
          className="w-full border-dashed"
          disabled={!linkUrl.trim()}
          onClick={handleAddLink}
        >
          <Link2 className="mr-1.5 h-4 w-4" />
          Anexar link
        </Button>
      </div>
    </div>
  );
}
