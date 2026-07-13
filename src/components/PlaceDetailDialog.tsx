import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { MapPin, Pencil, Plane, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { StarRating } from "@/components/StarRating";
import { FORM_DIALOG_CONTENT_CLASS } from "@/components/FormLabel";
import {
  PLACE_TYPE_EMOJI,
  PLACE_TYPE_LABELS,
  getRatingLabel,
} from "@/domain/places";
import type { PlaceVisit } from "@/types/places";
import { formatDateBR } from "@/lib/currency";

interface PlaceDetailDialogProps {
  place: PlaceVisit | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: () => void;
  onDelete?: () => void;
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
}: PlaceDetailDialogProps) {
  if (!place) return null;

  return (
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
          {place.rating != null && place.rating > 0 && (
            <DetailRow label="Avaliação">
              <div className="flex items-center gap-2">
                <StarRating value={place.rating} readonly />
                <span className="text-muted-foreground">
                  {getRatingLabel(place.rating)}
                </span>
              </div>
            </DetailRow>
          )}

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
  );
}
