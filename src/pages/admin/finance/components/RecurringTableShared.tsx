import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { TypeIcon } from "@/components/TypeIcon";
import { ActionTooltip } from "@/components/ActionTooltip";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  buildRenewedFixedSchedule,
  canRenewFixedPlan,
  getRecurringProgress,
  renewFixedRecurringApi,
  type RecurringProgress,
} from "@/api/recurring";
import { recurringNatureSide } from "@/domain/recurring/listView";
import { toast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
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

export function FixedPlanRenewButton({
  recurring,
  onRenewed,
  className,
  showLabel = false,
}: {
  recurring: Recurring;
  onRenewed: () => Promise<void> | void;
  className?: string;
  showLabel?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!canRenewFixedPlan(recurring)) return null;

  const schedule = buildRenewedFixedSchedule(recurring);
  const displayName =
    recurring.description || recurring.class?.name || "Sem descrição";
  const isAnnual = recurring.frequency === "Anual";

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <ActionTooltip label={`Renovar para ${schedule.year}`}>
        <AlertDialogTrigger asChild>
          <Button
            type="button"
            variant={showLabel ? "outline" : "ghost"}
            size={showLabel ? "sm" : "icon"}
            className={cn(
              showLabel ? "h-8 gap-1.5 px-2.5 text-xs" : "h-8 w-8",
              className
            )}
            aria-label={`Renovar para ${schedule.year}`}
          >
            <RefreshCw className="h-4 w-4" />
            {showLabel ? "Renovar" : null}
          </Button>
        </AlertDialogTrigger>
      </ActionTooltip>
      <AlertDialogContent>
        <AlertDialogHeader>Renovar para {schedule.year}?</AlertDialogHeader>
        <p className="text-sm text-muted-foreground">
          &quot;{displayName}&quot; estende o plano até{" "}
          {isAnnual ? schedule.year : `dez/${schedule.year}`}. As parcelas
          anteriores continuam na lista para desfazer se precisar; o ledger
          já lançado permanece.
        </p>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={async (e) => {
              e.preventDefault();
              if (busy) return;
              setBusy(true);
              try {
                const { year } = await renewFixedRecurringApi(recurring);
                toast({
                  title: "Renovada",
                  description: `Ciclo de ${year} pronto para acompanhar.`,
                });
                setOpen(false);
                await onRenewed();
              } catch (error) {
                toast({
                  title: "Erro ao renovar",
                  description: getErrorMessage(
                    error,
                    "Não foi possível renovar a parcela."
                  ),
                  variant: "destructive",
                });
              } finally {
                setBusy(false);
              }
            }}
          >
            Renovar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
