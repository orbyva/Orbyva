import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { updateAlbum, uploadAlbumCover } from "@/api/albums";
import type { Album, AlbumUpdateRequest } from "@/types/music";
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
  formatAlbumRating,
  formatArtists,
  getAlbumRatingLabel,
} from "@/domain/music";
import {
  formatLocalIsoDate,
  normalizeEntertainmentDates,
} from "@/domain/entertainment/insights";
import { getErrorMessage } from "@/lib/errors";
import { Input } from "@/components/ui/input";

interface AlbumEditModalProps {
  album: Album;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAlbumUpdated: () => void;
}

function normalizeDates(dates: Album["listened_dates"]): string[] {
  return normalizeEntertainmentDates(dates);
}

export function AlbumEditModal({
  album,
  open,
  onOpenChange,
  onAlbumUpdated,
}: AlbumEditModalProps) {
  const [rating, setRating] = useState<number | null>(album.rating ?? null);
  const [notes, setNotes] = useState(album.notes ?? "");
  const [wouldRecommend, setWouldRecommend] = useState(
    album.would_recommend !== false
  );
  const [listenedDate, setListenedDate] = useState<Date | undefined>();
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const { toast } = useToast();

  const isToListen = album.status === "to_listen";

  useEffect(() => {
    if (!open) return;
    setRating(album.rating ?? null);
    setNotes(album.notes ?? "");
    setWouldRecommend(album.would_recommend !== false);
    setListenedDate(undefined);
    setCoverFile(null);
    setFormError("");
  }, [open, album]);

  async function handleSave() {
    if (isToListen && !listenedDate) {
      setFormError("Informe a data em que ouviu.");
      return;
    }
    setFormError("");

    try {
      setLoading(true);
      const updateData: AlbumUpdateRequest = {
        musicbrainz_id: album.musicbrainz_id,
        rating,
        notes: notes.trim() || null,
        would_recommend: wouldRecommend,
      };

      if (coverFile) {
        updateData.cover_url = await uploadAlbumCover(
          album.musicbrainz_id,
          coverFile
        );
      }

      if (listenedDate) {
        const nextDate = formatLocalIsoDate(listenedDate);
        updateData.listened_dates = [
          ...normalizeDates(album.listened_dates),
          nextDate,
        ];
        updateData.status = "listened";
      }

      await updateAlbum(updateData);
      toast({
        title: "Sucesso",
        description: isToListen ? "Opinião registrada!" : "Opinião atualizada!",
        duration: 2000,
      });
      onOpenChange(false);
      onAlbumUpdated();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Falha ao atualizar."),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
        <DialogTitle>
          {isToListen ? "Avaliar álbum" : "Editar opinião"}
        </DialogTitle>

        <div className="flex items-start gap-3 sm:gap-4">
          <img
            src={album.cover_url || "/placeholder.svg"}
            alt={album.title}
            className="h-20 w-20 flex-none rounded object-cover"
            referrerPolicy="no-referrer"
          />
          <div className="min-w-0">
            <h3 className="truncate text-base font-medium sm:text-lg">
              {album.title}
              {album.release_year ? ` (${album.release_year})` : ""}
            </h3>
            <p className="truncate text-sm text-muted-foreground">
              {formatArtists(album.artists)} ·{" "}
              {ALBUM_TYPE_LABELS[album.album_type]}
            </p>
          </div>
        </div>

        <div className={FORM_FIELDS_CLASS}>
          <div>
            <FormLabel optional>Nota</FormLabel>
            <div className="space-y-2">
              <ScoreRating value={rating} onChange={setRating} />
              {rating != null && rating > 0 && (
                <p className="text-xs text-muted-foreground">
                  {formatAlbumRating(rating)}/10 — {getAlbumRatingLabel(rating)}
                </p>
              )}
            </div>
          </div>

          <div>
            <FormLabel required={isToListen} optional={!isToListen}>
              {isToListen ? "Data" : "Nova data"}
            </FormLabel>
            <DatePicker
              date={listenedDate}
              onSelect={setListenedDate}
              placeholder="Selecione a data"
            />
          </div>

          <div>
            <FormLabel optional>O que achou?</FormLabel>
            <textarea
              className="flex min-h-[88px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="Produção, faixas, vibe..."
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

          {!album.cover_url && (
            <div>
              <FormLabel optional>Adicionar capa</FormLabel>
              <Input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)}
              />
            </div>
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
              className="w-full sm:flex-1"
              disabled={loading}
              onClick={() => void handleSave()}
            >
              {loading
                ? "Salvando…"
                : isToListen
                  ? "Salvar"
                  : "Salvar alterações"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
