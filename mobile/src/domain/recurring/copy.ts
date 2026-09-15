import { recurringNatureSide } from "@/domain/recurring/listView";
import { getRecurringProgress } from "@/domain/recurring/alerts";
import type { Recurring } from "@/types/recurring";

export function getActionCopyBySide(isReceive: boolean) {
  return {
    isReceive,
    action: isReceive ? "Receber" : "Pagar",
    markAction: isReceive ? "Marcar como recebida" : "Marcar como paga",
    doneBadge: isReceive ? "Recebida" : "Paga",
    openBadge: "Em aberto",
    markTitle: isReceive ? "Marcar como recebida?" : "Marcar como paga?",
    unmarkTitle: isReceive
      ? "Desfazer recebimento?"
      : "Desfazer pagamento?",
    markToast: isReceive
      ? "Parcela marcada como recebida"
      : "Parcela marcada como paga",
    unmarkToast: isReceive ? "Recebimento desfeito" : "Pagamento desfeito",
    markHint: isReceive
      ? "A receita correspondente será registrada automaticamente."
      : "A transação correspondente será registrada automaticamente.",
    unmarkHint:
      "O status da parcela será revertido e a transação vinculada será excluída automaticamente.",
    progressPaidLabel: isReceive ? "recebidas" : "pagas",
  };
}

export function getRecurringActionCopy(recurring: Recurring) {
  return getActionCopyBySide(recurringNatureSide(recurring) === "receive");
}

export function getRemainingInfo(recurring: Recurring) {
  const progress = getRecurringProgress(recurring);
  if (!progress || !recurring.value) return null;
  return {
    ...progress,
    remainingAmount: progress.open * recurring.value,
  };
}
