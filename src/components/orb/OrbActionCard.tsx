import { Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  const resolved = proposal.status !== "pending";

  return (
    <div className="w-full max-w-[85%] rounded-xl border bg-card p-3 text-sm shadow-sm">
      <p className="text-foreground">{proposal.summary}</p>
      {resolved ? (
        <Badge
          variant={proposal.status === "applied" ? "default" : "secondary"}
          className="mt-2 gap-1"
        >
          {proposal.status === "applied" ? <Check className="h-3 w-3" /> : null}
          {RESOLVED_LABEL[proposal.status]}
        </Badge>
      ) : (
        <div className="mt-2 flex gap-2">
          <Button size="sm" onClick={onConfirm} className="gap-1">
            <Check className="h-3.5 w-3.5" /> Confirmar
          </Button>
          <Button size="sm" variant="outline" onClick={onDismiss} className="gap-1">
            <X className="h-3.5 w-3.5" /> Descartar
          </Button>
        </div>
      )}
    </div>
  );
}
