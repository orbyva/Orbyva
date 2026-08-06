import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  MapPin,
  Pencil,
  Plane,
  Share2,
  ThumbsDown,
  ThumbsUp,
  Trash2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { ShareImageDialog } from "@/components/ShareImageDialog";
import { StarRating } from "@/components/StarRating";
import { PlaceTypeIcon } from "@/components/PlaceTypeIcon";
import { StatusPill, ToneChip } from "@/components/StatusPill";
import { FORM_DIALOG_CONTENT_CLASS } from "@/components/FormLabel";
import {
  PLACE_TYPE_LABELS,
  formatRating,
  getRatingLabel,
  normalizePlaceStatus,
  placeTypeMeta,
} from "@/domain/places";
import type { PlaceVisit } from "@/types/places";
import type { TripPlaceOpinion } from "@/types/tripSharing";
import { formatBRL, formatDateBR } from "@/lib/currency";
import { generatePlaceShareImage, sharePlaceNative } from "@/lib/placeShare";
import { fetchPlaceOpinions } from "@/api/places";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

interface PlaceDetailDialogProps {
  place: PlaceVisit | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: () => void;
  /** Abre o formulário já no status Visitado (para avaliar). */
  onMarkVisited?: () => void;
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
  onMarkVisited,
  onDelete,
  isSharedTrip,
}: PlaceDetailDialogProps) {
  const [shareOpen, setShareOpen] = useState(false);
  const [opinions, setOpinions] = useState<TripPlaceOpinion[]>([]);
  const { user } = useAuth();

  const isTripPlace = Boolean(place?.trip_id || place?.trip?.id);

  useEffect(() => {
    if (!open || !place || !isTripPlace) {
      setOpinions([]);
      return;
    }
    void fetchPlaceOpinions(place.id)
      .then(setOpinions)
      .catch(() => setOpinions([]));
  }, [open, place, isTripPlace]);

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

  const myOpinion = opinions.find((o) => o.user_id === user?.id);
  const displayNotes = (myOpinion?.notes ?? place.notes)?.trim() || null;
  const displayRecommend =
    myOpinion?.would_recommend ?? place.would_recommend;
  const displayRating =
    myOpinion?.rating != null && myOpinion.rating > 0
      ? myOpinion.rating
      : place.rating != null && place.rating > 0
        ? place.rating
        : null;
  const shareNotes = Boolean(displayNotes);
  const isToVisit =
    normalizePlaceStatus(place.status, place.visited_date) === "to_visit";
  const typeMeta = placeTypeMeta(place.type);
  const typeLabel = PLACE_TYPE_LABELS[place.type];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className={cn(FORM_DIALOG_CONTENT_CLASS, "gap-0 overflow-hidden p-0")}
        >
          <DialogHeader className="space-y-0 px-4 pb-3 pt-4 pr-12 text-left sm:px-6 sm:pt-6">
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl",
                  typeMeta.tone
                )}
                aria-hidden
              >
                <PlaceTypeIcon type={place.type} className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <DialogTitle className="text-left text-base leading-snug sm:text-lg">
                  {place.name}
                </DialogTitle>
                <div className="flex flex-wrap items-center gap-1.5">
                  <ToneChip toneClassName={typeMeta.tone}>{typeLabel}</ToneChip>
                  {isToVisit ? (
                    <StatusPill tone="warning">Para visitar</StatusPill>
                  ) : (
                    <StatusPill tone="success">Visitado</StatusPill>
                  )}
                  {!isToVisit ? (
                    displayRecommend ? (
                      <ThumbsUp className="h-3.5 w-3.5 shrink-0 text-success" />
                    ) : (
                      <ThumbsDown className="h-3.5 w-3.5 shrink-0 text-destructive" />
                    )
                  ) : null}
                </div>
                {place.trip ? (
                  <Link
                    to={`/travel/${place.trip.id}`}
                    className="inline-flex max-w-full items-center gap-1.5 text-xs text-primary hover:underline"
                    onClick={() => onOpenChange(false)}
                  >
                    <Plane className="h-3 w-3 shrink-0" />
                    <span className="truncate">
                      {place.trip.title}
                      {place.trip.destination
                        ? ` · ${place.trip.destination}`
                        : ""}
                    </span>
                  </Link>
                ) : (
                  <p className="text-xs text-muted-foreground">Passeio local</p>
                )}
              </div>
            </div>
          </DialogHeader>

          <div className="max-h-[50vh] space-y-3 overflow-y-auto px-4 py-3 sm:px-6">
            {isToVisit ? (
              <div className="rounded-lg border border-warning/25 bg-warning/5 px-3 py-2.5">
                <p className="text-sm font-medium">Na lista · ainda não visitado</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Quando for, marque como visitado para avaliar e registrar o
                  gasto.
                </p>
              </div>
            ) : null}

            {!isToVisit && showGroupOpinions && groupAvg != null ? (
              <DetailRow label="Média do grupo">
                <div className="flex items-center gap-2">
                  <StarRating value={Math.round(groupAvg * 2) / 2} readonly />
                  <span className="text-muted-foreground">
                    {formatRating(Math.round(groupAvg * 10) / 10)} ·{" "}
                    {ratedOpinions.length} opinião(ões)
                  </span>
                </div>
              </DetailRow>
            ) : null}

            {!isToVisit && !showGroupOpinions && displayRating != null ? (
              <DetailRow label="Avaliação">
                <div className="flex items-center gap-2">
                  <StarRating value={displayRating} readonly />
                  <span className="text-muted-foreground">
                    {formatRating(displayRating)} ·{" "}
                    {getRatingLabel(displayRating)}
                  </span>
                </div>
              </DetailRow>
            ) : null}

            {!isToVisit && place.visited_date ? (
              <DetailRow label="Data da visita">
                {formatDateBR(place.visited_date)}
              </DetailRow>
            ) : null}

            {!isToVisit && place.amount != null && place.amount > 0 ? (
              <DetailRow label="Valor gasto">
                <span>
                  {formatBRL(place.amount)}
                  {place.transaction_id != null ? (
                    <span className="ml-2 text-xs text-muted-foreground">
                      · no extrato
                    </span>
                  ) : null}
                </span>
              </DetailRow>
            ) : null}

            {place.address ? (
              <DetailRow label="Endereço">
                <p className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>{place.address}</span>
                </p>
              </DetailRow>
            ) : null}

            {showGroupOpinions ? (
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
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatRating(o.rating)}/5 · {getRatingLabel(o.rating)}
                        </p>
                      ) : null}
                      {o.notes?.trim() ? (
                        <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
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
            ) : displayNotes ? (
              <DetailRow label="Comentário">
                <p className="whitespace-pre-wrap text-muted-foreground">
                  {displayNotes}
                </p>
              </DetailRow>
            ) : null}
          </div>

          <div className="border-t border-border/80 bg-muted/30 px-4 py-3 sm:px-6">
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
              {onDelete ? (
                <ConfirmDeleteDialog
                  title="Excluir este lugar?"
                  description={`“${place.name}” será removido da lista.`}
                  onConfirm={() => {
                    onDelete();
                    onOpenChange(false);
                  }}
                >
                  <Button
                    variant="outline"
                    className="text-destructive sm:mr-auto"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Excluir
                  </Button>
                </ConfirmDeleteDialog>
              ) : null}

              {!isToVisit ? (
                <Button variant="outline" onClick={() => setShareOpen(true)}>
                  <Share2 className="mr-2 h-4 w-4" />
                  Compartilhar
                </Button>
              ) : null}

              {isToVisit && onEdit ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    onOpenChange(false);
                    onEdit();
                  }}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Editar
                </Button>
              ) : null}

              {isToVisit && onMarkVisited ? (
                <Button
                  onClick={() => {
                    onOpenChange(false);
                    onMarkVisited();
                  }}
                >
                  Marcar como visitado
                </Button>
              ) : onEdit ? (
                <Button
                  onClick={() => {
                    onOpenChange(false);
                    onEdit();
                  }}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Editar
                </Button>
              ) : null}
            </div>
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
        allowNotes={shareNotes}
      />
    </>
  );
}
