import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { track } from "@/lib/analytics";
import { Button } from "@/components/ui/button";

type HubStaleNudgeProps = {
  daysWithoutTx: number;
  onDismiss: () => void;
};

export function HubStaleNudge({
  daysWithoutTx,
  onDismiss,
}: HubStaleNudgeProps) {
  return (
    <section className="relative flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
      <p className="text-sm">
        <span className="font-semibold">
          Sem lançamentos há {daysWithoutTx} dias.
        </span>{" "}
        <span className="text-muted-foreground">
          Um registro rápido mantém o ledger vivo.
        </span>
      </p>
      <div className="flex items-center gap-1.5">
        <Button size="sm" className="h-8" asChild>
          <Link
            to="/finance/transactions?new=1"
            onClick={() => track("quick_add_open", { source: "stale_nudge" })}
          >
            Lançar agora
          </Link>
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          aria-label="Dispensar"
          onClick={onDismiss}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </section>
  );
}
