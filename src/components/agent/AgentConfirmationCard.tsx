import { Button } from "@/components/ui/button";
import type { AgentPendingAction } from "@/domain/agent";
import { Check, X } from "lucide-react";

interface AgentConfirmationCardProps {
  pendingAction: AgentPendingAction;
  loading?: boolean;
  onConfirm: (actionId: string) => void;
  onCancel: (actionId: string) => void;
}

export function AgentConfirmationCard({
  pendingAction,
  loading,
  onConfirm,
  onCancel,
}: AgentConfirmationCardProps) {
  return (
    <div className="mt-3 rounded-xl border border-amber-500/50 bg-gradient-to-b from-amber-500/10 to-amber-500/5 p-4 shadow-sm">
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
        Confirmação necessária
      </p>
      <p className="mb-3 text-sm font-semibold text-foreground">
        {pendingAction.summary}
      </p>
      <dl className="mb-4 space-y-1.5">
        {pendingAction.fields.map((field) => (
          <div key={field.label} className="flex justify-between gap-4 text-sm">
            <dt className="text-muted-foreground">{field.label}</dt>
            <dd className="font-medium text-right">{field.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mb-3 text-xs text-muted-foreground">Confirmar cadastro?</p>
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => onConfirm(pendingAction.id)}
          disabled={loading}
        >
          <Check className="h-4 w-4" />
          Confirmar
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onCancel(pendingAction.id)}
          disabled={loading}
        >
          <X className="h-4 w-4" />
          Cancelar
        </Button>
      </div>
    </div>
  );
}
