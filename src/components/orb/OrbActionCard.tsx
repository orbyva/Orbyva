import { useState } from "react";
import { Check, Image as ImageIcon, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScoreRating } from "@/components/ScoreRating";
import { formatMovieRating } from "@/domain/movies";
import { proposalDisplay, titleWithYear } from "@/domain/orb/proposalDisplay";
import type { OrbProposal } from "@/types/orb";

const RESOLVED_LABEL: Partial<Record<OrbProposal["status"], string>> = {
  applied: "Aplicado",
  dismissed: "Descartado",
  expired: "Expirado",
};

export function OrbActionCard({
  proposal,
  onConfirm,
  onDismiss,
}: {
  proposal: OrbProposal;
  /** `rating` vem preenchido quando o usuário deu nota antes de confirmar. */
  onConfirm: (rating: number | null) => void;
  onDismiss: () => void;
}) {
  const resolved = proposal.status !== "pending";
  const display = proposalDisplay(proposal);
  const [rating, setRating] = useState<number | null>(null);
  const [coverFailed, setCoverFailed] = useState(false);
  const showCover = display.cover && !coverFailed;

  return (
    <div className="w-full max-w-[85%] overflow-hidden rounded-xl border bg-card text-sm shadow-sm">
      <div className="flex gap-3 p-3">
        {showCover ? (
          <img
            src={display.cover ?? undefined}
            alt=""
            loading="lazy"
            onError={() => setCoverFailed(true)}
            className="h-24 w-16 shrink-0 rounded-md object-cover"
          />
        ) : (
          <div
            aria-hidden
            className="flex h-24 w-16 shrink-0 items-center justify-center rounded-md bg-muted"
          >
            <ImageIcon className="h-5 w-5 text-muted-foreground/50" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <Badge variant="secondary" className="mb-1">
            {display.kindLabel}
          </Badge>
          <p className="font-medium leading-snug text-foreground">
            {titleWithYear(display)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {proposal.summary}
          </p>
        </div>
      </div>

      {resolved ? (
        <div className="px-3 pb-3">
          <Badge
            variant={proposal.status === "applied" ? "default" : "secondary"}
            className="gap-1"
          >
            {proposal.status === "applied" ? (
              <Check className="h-3 w-3" />
            ) : null}
            {RESOLVED_LABEL[proposal.status]}
          </Badge>
        </div>
      ) : (
        <div className="border-t px-3 py-3">
          <div className="mb-3">
            <p className="mb-1 text-xs text-muted-foreground">
              Nota{" "}
              <span className="text-muted-foreground/70">
                {rating != null
                  ? `· ${formatMovieRating(rating)}/10`
                  : "· opcional"}
              </span>
            </p>
            <ScoreRating value={rating} onChange={setRating} size="sm" />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => onConfirm(rating)} className="gap-1">
              <Check className="h-3.5 w-3.5" /> Confirmar
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onDismiss}
              className="gap-1"
            >
              <X className="h-3.5 w-3.5" /> Descartar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
