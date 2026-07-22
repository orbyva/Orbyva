import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { MapPin, Pencil, Plane, Share2, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { ShareImageDialog } from "@/components/ShareImageDialog";
import { StarRating } from "@/components/StarRating";
import { FORM_DIALOG_CONTENT_CLASS } from "@/components/FormLabel";
import {
  PLACE_TYPE_EMOJI,
  PLACE_TYPE_LABELS,
  formatRating,
  getRatingLabel,
} from "@/domain/places";
import type { PlaceVisit } from "@/types/places";
import type { TripPlaceOpinion } from "@/types/tripSharing";
import { formatDateBR } from "@/lib/currency";
import { generatePlaceShareImage, sharePlaceNative } from "@/lib/placeShare";
import { fetchPlaceOpinions, upsertPlaceOpinion } from "@/api/places";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";

interface PlaceDetailDialogProps {
  place: PlaceVisit | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onOpinionSaved?: () => void;
  /** Viagem compartilhada — mostra médias/opiniões do grupo. */
  isSharedTrip?: boolean;
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

export function PlaceDetailDialog({
  place,
  open,
  onOpenChange,
  onEdit,
  onDelete,
  onOpinionSaved,
  isSharedTrip,
}: PlaceDetailDialogProps) {
  const [shareOpen, setShareOpen] = useState(false);
  const [opinions, setOpinions] = useState<TripPlaceOpinion[]>([]);
  const [myRating, setMyRating] = useState<number | null>(null);
  const [myNotes, setMyNotes] = useState("");
  const [myRecommend, setMyRecommend] = useState(true);
  const [savingOpinion, setSavingOpinion] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  const isTripPlace = Boolean(place?.trip_id || place?.trip?.id);

  useEffect(() => {
    if (!open || !place || !isTripPlace) {
      setOpinions([]);
      return;
    }
    void fetchPlaceOpinions(place.id)
      .then((list) => {
        setOpinions(list);
        const mine = list.find((o) => o.user_id === user?.id);
        setMyRating(mine?.rating ?? place.rating ?? null);
        setMyNotes(mine?.notes ?? "");
        setMyRecommend(mine?.would_recommend ?? true);
      })
      .catch(() => setOpinions([]));
  }, [open, place, isTripPlace, user?.id]);

  const generateImage = useCallback(
    async (options: {
      photo?: HTMLImageElement | null;
      photos?: HTMLImageElement[];
      backdropPhoto?: HTMLImageElement | null;
      includeNotes?: boolean;
    } = {}) => {
      if (!place) return null;
      return generatePlaceShareImage(place, {
        photos: options.photos?.length
          ? options.photos
          : options.photo
            ? [options.photo]
            : [],
        backdropPhoto: options.backdropPhoto ?? null,
        includeNotes: options.includeNotes,
      });
    },
    [place]
  );

  const share = useCallback(
    async (
      blob: Blob | null,
      options: { includeNotes?: boolean } = {}
    ) => {
      if (!place) return "cancelled" as const;
      return sharePlaceNative(place, blob, {
        includeNotes: options.includeNotes,
      });
    },
    [place]
  );

  if (!place) return null;

  const ratedOpinions = opinions.filter((o) => o.rating != null && o.rating > 0);
  const uniqueAuthors = new Set(opinions.map((o) => o.user_id).filter(Boolean));
  const showGroupOpinions =
    isSharedTrip === true ||
    (isSharedTrip !== false &&
      (uniqueAuthors.size > 1 ||
        (place.opinionSummary?.totalOpinions ?? 0) > 1));
  const groupAvg =
    showGroupOpinions && ratedOpinions.length > 0
      ? ratedOpinions.reduce((s, o) => s + (o.rating ?? 0), 0) /
        ratedOpinions.length
      : null;

  async function handleSaveOpinion() {
    if (!place) return;
    setSavingOpinion(true);
    try {
      await upsertPlaceOpinion(place.id, {
        rating: myRating,
        notes: myNotes.trim() || null,
        would_recommend: myRecommend,
      });
      toast({ title: "Sua opinião foi salva", duration: 2000 });
      const list = await fetchPlaceOpinions(place.id);
      setOpinions(list);
      onOpinionSaved?.();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setSavingOpinion(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
          <DialogHeader>
            <div className="flex items-start gap-3 pr-6">
              <span className="text-3xl">{PLACE_TYPE_EMOJI[place.type]}</span>
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-left leading-snug">
                  {place.name}
                </DialogTitle>
                <Badge variant="outline" className="mt-2 text-[10px]">
                  {PLACE_TYPE_LABELS[place.type]}
                </Badge>
              </div>
              {place.would_recommend ? (
                <ThumbsUp className="h-5 w-5 shrink-0 text-success" />
              ) : (
                <ThumbsDown className="h-5 w-5 shrink-0 text-destructive" />
              )}
            </div>
          </DialogHeader>

          <div className="space-y-4">
            {showGroupOpinions && groupAvg != null ? (
              <DetailRow label="Média do grupo">
                <div className="flex items-center gap-2">
                  <StarRating value={Math.round(groupAvg * 2) / 2} readonly />
                  <span className="text-muted-foreground">
                    {formatRating(Math.round(groupAvg * 10) / 10)} ·{" "}
                    {ratedOpinions.length} opinião(ões)
                  </span>
                </div>
              </DetailRow>
            ) : place.rating != null && place.rating > 0 ? (
              <DetailRow label="Avaliação">
                <div className="flex items-center gap-2">
                  <StarRating value={place.rating} readonly />
                  <span className="text-muted-foreground">
                    {formatRating(place.rating)} · {getRatingLabel(place.rating)}
                  </span>
                </div>
              </DetailRow>
            ) : null}

            <DetailRow label="Data da visita">
              {formatDateBR(place.visited_date)}
            </DetailRow>

            {place.address && (
              <DetailRow label="Endereço">
                <p className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>{place.address}</span>
                </p>
              </DetailRow>
            )}

            {place.trip ? (
              <DetailRow label="Viagem">
                <Link
                  to={`/travel/${place.trip.id}`}
                  className="inline-flex items-center gap-1.5 text-primary hover:underline"
                  onClick={() => onOpenChange(false)}
                >
                  <Plane className="h-3.5 w-3.5" />
                  {place.trip.title}
                  {place.trip.destination ? ` · ${place.trip.destination}` : ""}
                </Link>
              </DetailRow>
            ) : (
              <DetailRow label="Contexto">Passeio local</DetailRow>
            )}

            {isTripPlace && showGroupOpinions ? (
              <>
                <DetailRow label="Opiniões do grupo">
                  <ul className="space-y-2">
                    {opinions.map((o) => (
                      <li
                        key={o.id}
                        className="rounded-lg border px-3 py-2 text-sm"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">
                            {o.display_name ||
                              (o.user_id === user?.id ? "Você" : "Viajante")}
                          </span>
                          {o.would_recommend ? (
                            <ThumbsUp className="h-3.5 w-3.5 text-success" />
                          ) : (
                            <ThumbsDown className="h-3.5 w-3.5 text-destructive" />
                          )}
                        </div>
                        {o.rating != null && o.rating > 0 ? (
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatRating(o.rating)}/5 ·{" "}
                            {getRatingLabel(o.rating)}
                          </p>
                        ) : null}
                        {o.notes?.trim() ? (
                          <p className="mt-1 text-muted-foreground whitespace-pre-wrap">
                            {o.notes}
                          </p>
                        ) : null}
                      </li>
                    ))}
                    {opinions.length === 0 ? (
                      <p className="text-muted-foreground">
                        Nenhuma opinião ainda.
                      </p>
                    ) : null}
                  </ul>
                </DetailRow>

                <div className="space-y-3 rounded-lg border p-3">
                  <p className="text-sm font-medium">Sua opinião</p>
                  <StarRating value={myRating ?? 0} onChange={setMyRating} />
                  <textarea
                    value={myNotes}
                    onChange={(e) => setMyNotes(e.target.value)}
                    placeholder="O que achou?"
                    rows={3}
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={myRecommend}
                      onChange={(e) => setMyRecommend(e.target.checked)}
                      className="rounded"
                    />
                    Recomendaria
                  </label>
                  <Button
                    size="sm"
                    disabled={savingOpinion}
                    onClick={() => void handleSaveOpinion()}
                  >
                    {savingOpinion ? "Salvando…" : "Salvar minha opinião"}
                  </Button>
                </div>
              </>
            ) : isTripPlace ? (
              <div className="space-y-3 rounded-lg border p-3">
                <p className="text-sm font-medium">Sua avaliação</p>
                <StarRating value={myRating ?? 0} onChange={setMyRating} />
                <textarea
                  value={myNotes}
                  onChange={(e) => setMyNotes(e.target.value)}
                  placeholder="O que achou?"
                  rows={3}
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={myRecommend}
                    onChange={(e) => setMyRecommend(e.target.checked)}
                    className="rounded"
                  />
                  Recomendaria
                </label>
                <Button
                  size="sm"
                  disabled={savingOpinion}
                  onClick={() => void handleSaveOpinion()}
                >
                  {savingOpinion ? "Salvando…" : "Salvar avaliação"}
                </Button>
              </div>
            ) : (
              <>
                {place.notes && (
                  <DetailRow label="Comentário">
                    <p className="whitespace-pre-wrap text-muted-foreground">
                      {place.notes}
                    </p>
                  </DetailRow>
                )}
                <DetailRow label="Recomendação">
                  {place.would_recommend ? "Recomendaria" : "Não recomendaria"}
                </DetailRow>
              </>
            )}
          </div>

          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            {onDelete && (
              <ConfirmDeleteDialog
                title="Excluir este lugar?"
                description={`A avaliação de "${place.name}" será removida.`}
                onConfirm={() => {
                  onDelete();
                  onOpenChange(false);
                }}
              >
                <Button variant="outline" className="text-destructive sm:mr-auto">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Excluir
                </Button>
              </ConfirmDeleteDialog>
            )}
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
            <Button variant="outline" onClick={() => setShareOpen(true)}>
              <Share2 className="mr-2 h-4 w-4" />
              Compartilhar
            </Button>
            {onEdit && (
              <Button
                onClick={() => {
                  onOpenChange(false);
                  onEdit();
                }}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Editar
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ShareImageDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        title="Compartilhar lugar"
        generateImage={generateImage}
        share={share}
        allowPhoto
        maxPhotos={4}
        allowNotes={Boolean(place.notes?.trim())}
      />
    </>
  );
}
