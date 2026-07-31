import { TypeIcon } from "@/components/TypeIcon";
import {
  getRecurringProgress,
  type RecurringProgress,
} from "@/api/recurring";
import { recurringNatureSide } from "@/domain/recurring/listView";
import { Recurring } from "@/types/recurring";

export function RecurringIcon({ recurring }: { recurring: Recurring }) {
  return (
    <TypeIcon
      name={recurring.class?.type?.lucide_icon}
      className="h-4 w-4"
      style={{ color: String(recurring.class?.type?.hex_color ?? "") }}
    />
  );
}

/** Copy de ação conforme natureza (Receita → receber; Despesa → pagar). */
export function getActionCopyBySide(isReceive: boolean) {
  return {
    isReceive,
    action: isReceive ? "Receber" : "Pagar",
    markAction: isReceive ? "Marcar como recebida" : "Marcar como paga",
    doneBadge: isReceive ? "Recebida" : "Paga",
    openBadge: "Em aberto",
    markTitle: isReceive
      ? "Marcar como recebida?"
      : "Marcar como paga?",
    unmarkTitle: isReceive
      ? "Desfazer recebimento?"
      : "Desfazer pagamento?",
    markToast: isReceive
      ? "Parcela marcada como recebida"
      : "Parcela marcada como paga",
    unmarkToast: isReceive
      ? "Recebimento desfeito"
      : "Pagamento desfeito",
    markHint: isReceive
      ? "A receita correspondente será registrada automaticamente."
      : "A transação correspondente será registrada automaticamente.",
    unmarkHint:
      "O status da parcela será revertido e a transação vinculada será excluída automaticamente.",
    archiveLabel: isReceive
      ? "Marcar recorrência como recebida"
      : "Marcar recorrência como paga",
    archiveTitle: isReceive
      ? "Marcar como recebida?"
      : "Marcar como paga?",
    archiveConfirm: isReceive
      ? "Marcar como recebida"
      : "Marcar como paga",
    progressPaidLabel: isReceive ? "recebidas" : "pagas",
  };
}

export function getRecurringActionCopy(recurring: Recurring) {
  return getActionCopyBySide(recurringNatureSide(recurring) === "receive");
}

export function ProgressBar({
  progress,
  paidWord = "pagas",
}: {
  progress: RecurringProgress;
  paidWord?: string;
}) {
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          {progress.paid}/{progress.total} {paidWord}
        </span>
        <span>{progress.open} em aberto</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-muted/80">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${progress.percent}%` }}
          role="progressbar"
          aria-valuenow={progress.percent}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  );
}

export function getRemainingInfo(recurring: Recurring) {
  const progress = getRecurringProgress(recurring);
  if (!progress || !recurring.value) return null;

  return {
    ...progress,
    remainingAmount: progress.open * recurring.value,
  };
}
