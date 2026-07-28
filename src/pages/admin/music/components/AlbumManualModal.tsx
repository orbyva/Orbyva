import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createAlbum, uploadAlbumCover } from "@/api/albums";
import type { AlbumCreateRequest, AlbumStatus, AlbumType } from "@/types/music";
import { Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DatePicker } from "@/components/DatePicker";
import { ScoreRating } from "@/components/ScoreRating";
import {
  FormLabel,
  FORM_DIALOG_CONTENT_CLASS,
  FORM_FIELDS_CLASS,
} from "@/components/FormLabel";
import {
  ALBUM_TYPE_LABELS,
  ALBUM_TYPES_FOR_ADD,
  formatAlbumRating,
  getAlbumRatingLabel,
  newManualAlbumId,
} from "@/domain/music";
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
  /** Pré-preenche ao abrir (ex.: texto da busca MusicBrainz). */
  initialTitle?: string;
  initialArtists?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Esconde o botão interno — o pai controla a abertura. */
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
            ? [listenedDate.toISOString().split("T")[0]]
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

      <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
        <DialogTitle>Álbum manual</DialogTitle>
        <div className={FORM_FIELDS_CLASS}>
          <div>
            <FormLabel required>Nome do álbum/EP</FormLabel>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Nome do álbum/EP"
              autoFocus
            />
          </div>
          <div>
            <FormLabel required>Artista</FormLabel>
            <Input
              placeholder="Separe vários com vírgula"
              value={artists}
              onChange={(e) => setArtists(e.target.value)}
            />
          </div>
          <div>
            <FormLabel required>Tipo</FormLabel>
            <Select
              value={albumType}
              onValueChange={(v) => setAlbumType(v as AlbumType)}
            >
              <SelectTrigger>
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
          </div>
          <div>
            <FormLabel optional>Ano</FormLabel>
            <Input
              type="number"
              inputMode="numeric"
              placeholder="2024"
              value={year}
              onChange={(e) => setYear(e.target.value)}
            />
          </div>
          <div>
            <FormLabel optional>Capa (arquivo)</FormLabel>
            <Input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div>
            <FormLabel optional>Ou URL da capa</FormLabel>
            <Input
              type="url"
              placeholder="https://..."
              value={coverUrl}
              onChange={(e) => setCoverUrl(e.target.value)}
            />
          </div>

          <div>
            <FormLabel required>Status</FormLabel>
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
          </div>

          {status === "listened" && (
            <>
              <div>
                <FormLabel optional>Nota</FormLabel>
                <div className="space-y-2">
                  <ScoreRating value={rating} onChange={setRating} />
                  {rating != null && rating > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {formatAlbumRating(rating)}/10 —{" "}
                      {getAlbumRatingLabel(rating)}
                    </p>
                  )}
                </div>
              </div>
              <div>
                <FormLabel required>Data</FormLabel>
                <DatePicker date={listenedDate} onSelect={setListenedDate} />
              </div>
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

          {formError && <p className="text-sm text-destructive">{formError}</p>}

          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button
              variant="outline"
              className="w-full sm:flex-1"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              className="w-full sm:flex-1"
              disabled={loading}
              onClick={() => void handleSave()}
            >
              {loading ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
