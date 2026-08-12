import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { createAlbum, uploadAlbumCover } from "@/api/albums";
import type { AlbumCreateRequest, AlbumStatus, AlbumType } from "@/types/music";
import { Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DatePicker } from "@/components/DatePicker";
import { ScoreRating } from "@/components/ScoreRating";
import { FormField, FormFieldRow } from "@/components/FormField";
import {
  FormDialogShell,
  FormFooter,
} from "@/components/FormDialogShell";
import { FormSection } from "@/components/FormSection";
import { Separator } from "@/components/ui/separator";
import {
  ALBUM_TYPE_LABELS,
  ALBUM_TYPES_FOR_ADD,
  formatAlbumRating,
  getAlbumRatingLabel,
  newManualAlbumId,
} from "@/domain/music";
import { formatLocalIsoDate } from "@/domain/entertainment/insights";
import { getErrorMessage } from "@/lib/errors";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AlbumManualModalProps {
  onAlbumAdded: () => void;
  /** Pré-preenche ao abrir (ex.: texto da busca no catálogo). */
  initialTitle?: string;
  initialArtists?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Esconde o botão interno, o pai controla a abertura. */
  hideTrigger?: boolean;
  triggerLabel?: string;
  triggerVariant?: "default" | "outline" | "secondary" | "ghost";
  triggerClassName?: string;
}

export function AlbumManualModal({
  onAlbumAdded,
  initialTitle = "",
  initialArtists = "",
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
  triggerLabel = "Adicionar álbum manualmente",
  triggerVariant = "outline",
  triggerClassName = "w-full gap-2",
}: AlbumManualModalProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : uncontrolledOpen;

  function setOpen(next: boolean) {
    if (!isControlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  }

  const [title, setTitle] = useState("");
  const [artists, setArtists] = useState("");
  const [albumType, setAlbumType] = useState<AlbumType>("album");
  const [year, setYear] = useState("");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverUrl, setCoverUrl] = useState("");
  const [status, setStatus] = useState<AlbumStatus>("to_listen");
  const [rating, setRating] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [wouldRecommend, setWouldRecommend] = useState(true);
  const [listenedDate, setListenedDate] = useState<Date | undefined>();
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const { toast } = useToast();

  function resetFields() {
    setTitle("");
    setArtists("");
    setAlbumType("album");
    setYear("");
    setCoverFile(null);
    setCoverUrl("");
    setStatus("to_listen");
    setRating(null);
    setNotes("");
    setWouldRecommend(true);
    setListenedDate(undefined);
    setFormError("");
  }

  useEffect(() => {
    if (!isOpen) return;
    setTitle(initialTitle);
    setArtists(initialArtists);
    setAlbumType("album");
    setYear("");
    setCoverFile(null);
    setCoverUrl("");
    setStatus("to_listen");
    setRating(null);
    setNotes("");
    setWouldRecommend(true);
    setListenedDate(undefined);
    setFormError("");
  }, [isOpen, initialTitle, initialArtists]);

  async function handleSave() {
    if (!title.trim()) {
      setFormError("Informe o nome do álbum.");
      return;
    }
    if (!artists.trim()) {
      setFormError("Informe o artista.");
      return;
    }

    const yearNum = year.trim() ? Number(year.trim()) : null;
    if (year.trim() && (!Number.isFinite(yearNum) || (yearNum ?? 0) < 1900)) {
      setFormError("Ano inválido.");
      return;
    }

    if (status === "listened" && !listenedDate) {
      setFormError("Informe a data em que ouviu.");
      return;
    }

    setFormError("");
    setLoading(true);

    const id = newManualAlbumId();

    try {
      let finalCover: string | null = coverUrl.trim() || null;
      if (coverFile) {
        finalCover = await uploadAlbumCover(id, coverFile);
      }

      const payload: AlbumCreateRequest = {
        musicbrainz_id: id,
        title: title.trim(),
        artists: artists
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean),
        release_year: yearNum,
        album_type: albumType,
        cover_url: finalCover,
        source: "manual",
        status,
        rating: status === "listened" ? rating : null,
        notes: status === "listened" ? notes.trim() || null : null,
        would_recommend: status === "listened" ? wouldRecommend : true,
        listened_dates:
          status === "listened" && listenedDate
            ? [formatLocalIsoDate(listenedDate)]
            : [],
      };

      await createAlbum(payload);
      toast({ title: "Sucesso", description: "Álbum adicionado!", duration: 2000 });
      resetFields();
      setOpen(false);
      onAlbumAdded();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Falha ao salvar."),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setOpen(open);
        if (!open) resetFields();
      }}
    >
      {!hideTrigger ? (
        <DialogTrigger asChild>
          <Button variant={triggerVariant} className={triggerClassName}>
            <Plus className="h-4 w-4" />
            {triggerLabel}
          </Button>
        </DialogTrigger>
      ) : null}

      <FormDialogShell
        title="Álbum manual"
        description="Cadastre um álbum que não está no catálogo."
        errorSummary={formError || undefined}
        footer={
          <FormFooter
            onCancel={() => setOpen(false)}
            onSubmit={() => void handleSave()}
            submitLabel="Adicionar à lista"
            loading={loading}
          />
        }
      >
        <FormSection title="Identificação">
          <FormField label="Nome do álbum/EP" required>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Nome do álbum/EP"
              autoFocus
            />
          </FormField>

          <FormField label="Artista" required>
            <Input
              placeholder="Separe vários com vírgula"
              value={artists}
              onChange={(e) => setArtists(e.target.value)}
            />
          </FormField>

          <FormFieldRow>
            <FormField label="Tipo" required>
              <Select
                value={albumType}
                onValueChange={(v) => setAlbumType(v as AlbumType)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALBUM_TYPES_FOR_ADD.map((t) => (
                    <SelectItem key={t} value={t}>
                      {ALBUM_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            <FormField label="Ano" optional>
              <Input
                type="number"
                inputMode="numeric"
                placeholder="2024"
                value={year}
                onChange={(e) => setYear(e.target.value)}
              />
            </FormField>
          </FormFieldRow>
        </FormSection>

        <Separator />

        <FormSection title="Capa">
          <FormField label="Arquivo" optional>
            <Input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)}
            />
          </FormField>

          <FormField label="Ou URL" optional>
            <Input
              type="url"
              placeholder="https://..."
              value={coverUrl}
              onChange={(e) => setCoverUrl(e.target.value)}
            />
          </FormField>
        </FormSection>

        <Separator />

        <FormSection title="Lista">
          <FormField label="Status" required>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant={status === "to_listen" ? "default" : "outline"}
                onClick={() => setStatus("to_listen")}
                className="w-full sm:w-auto"
              >
                Para ouvir
              </Button>
              <Button
                type="button"
                variant={status === "listened" ? "default" : "outline"}
                onClick={() => setStatus("listened")}
                className="w-full sm:w-auto"
              >
                Ouvido
              </Button>
            </div>
          </FormField>
        </FormSection>

        {status === "listened" && (
          <>
            <Separator />
            <FormSection title="Opinião">
              <FormField
                label="Nota"
                optional
                hint={
                  rating != null && rating > 0
                    ? `${formatAlbumRating(rating)}/10 - ${getAlbumRatingLabel(rating)}`
                    : undefined
                }
              >
                <ScoreRating value={rating} onChange={setRating} />
              </FormField>

              <FormField label="Data" required>
                <DatePicker date={listenedDate} onSelect={setListenedDate} />
              </FormField>

              <FormField label="O que achou?" optional>
                <textarea
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  placeholder="Sua opinião..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </FormField>

              <label className="flex items-center gap-2 text· sm">
                <input
                  type="checkbox"
                  checked={wouldRecommend}
                  onChange={(e) => setWouldRecommend(e.target.checked)}
                  className="rounded"
                />
                Recomendaria
              </label>
            </FormSection>
          </>
        )}
      </FormDialogShell>
    </Dialog>
  );
}
