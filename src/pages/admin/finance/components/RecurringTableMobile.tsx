import { ChevronDown, CheckCircle, Pen, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  deleteRecurringApi,
  softDeleteRecurring,
  formatInstallmentPlanSummary,
  getRecurringProgress,
} from "@/api/recurring";
import { formatBRL, formatDateBR } from "@/lib/currency";
import { Installment, Recurring } from "@/types/recurring";
import { cn } from "@/lib/utils";
import { ICON_EDIT_BUTTON_CLASS } from "@/components/FormLabel";
import { MobileStackList, MobileStackRow } from "@/components/MobileStackList";
import {
  RecurringIcon,
  ProgressBar,
  FixedPlanRenewButton,
} from "./RecurringTableShared";
import {
  getRemainingInfo,
  getRecurringActionCopy,
  getActionCopyBySide,
} from "./recurringTableCopy";

export interface RecurringTableMobileProps {
  recurring: Recurring[];
  lastPaidAtById?: Record<string, string>;
  confirmOpen: boolean;
  setConfirmOpen: (open: boolean) => void;
  confirmOpenSoft: boolean;
  setConfirmOpenSoft: (open: boolean) => void;
  confirmPaymentOpen: boolean;
  setConfirmPaymentOpen: (open: boolean) => void;
  selectedRecurring: Recurring | null;
  setSelectedRecurring: (rec: Recurring | null) => void;
  selectedParcel: { transactionId: string; installmentNumber: number } | null;
  setSelectedParcel: (
    parcel: { transactionId: string; installmentNumber: number } | null
  ) => void;
  reloadRecurring: () => Promise<void>;
  onConfirmParcelPayment: () => void | Promise<void>;
  handleEditRecurring: (recurring: Recurring) => void;
  expandedRows: Record<string, boolean>;
  toggleExpanded: (id: string) => void;
  paymentAction: "mark" | "unmark" | null;
  setPaymentAction: (action: "mark" | "unmark" | null) => void;
}

export function RecurringTableMobile({
  recurring,
  lastPaidAtById = {},
  confirmOpen,
  setConfirmOpen,
  confirmOpenSoft,
  setConfirmOpenSoft,
  confirmPaymentOpen,
  setConfirmPaymentOpen,
  selectedRecurring,
  setSelectedRecurring,
  selectedParcel,
  setSelectedParcel,
  reloadRecurring,
  onConfirmParcelPayment,
  handleEditRecurring,
  expandedRows,
  toggleExpanded,
  paymentAction,
  setPaymentAction,
}: RecurringTableMobileProps) {
  return (
      <TooltipProvider delayDuration={300}>
        <MobileStackList>
          {recurring.map((item) => {
            const paidParcels = item.paid_parcels || [];
            const remainingInfo = getRemainingInfo(item);
            const installments = item.installments;
            const planSummary = formatInstallmentPlanSummary(item);
            const progress = getRecurringProgress(item);
            const isExpanded = !!expandedRows[item.id];
            const displayName =
              item.description || item.class?.name || "Sem descrição";
            const copy = getRecurringActionCopy(item);

            return (
              <MobileStackRow key={item.id}>
                <div className="flex items-start gap-3">
                  <RecurringIcon recurring={item} />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-medium leading-snug">{displayName}</p>
                    {lastPaidAtById[item.id] ? (
                      <p className="text-[11px] text-muted-foreground">
                        Pago em {formatDateBR(lastPaidAtById[item.id])}
                      </p>
                    ) : null}
                    <p className="text-sm text-muted-foreground">
                      {item.class?.type?.name} · {item.class?.name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {item.frequency}
                    </p>
                  </div>
                  <span className="shrink-0 text-base font-semibold tabular-nums">
                    {formatBRL(item.value ?? 0)}
                  </span>
                </div>

                {planSummary && (
                  <div className="space-y-1 rounded-lg bg-muted/30 px-3 py-2">
                    <span className="text-sm font-medium">{planSummary.title}</span>
                    <p className="text-xs text-muted-foreground">{planSummary.subtitle}</p>
                    {progress && (
                      <ProgressBar
                        progress={progress}
                        paidWord={copy.progressPaidLabel}
                      />
                    )}
                  </div>
                )}

                {remainingInfo && (
                  <p className="text-sm text-muted-foreground">
                    Saldo:{" "}
                    <span className="font-medium text-foreground tabular-nums">
                      {formatBRL(remainingInfo.remainingAmount)}
                    </span>
                    {" · "}
                    {remainingInfo.open}x de {formatBRL(item.value)}
                  </p>
                )}

                <div className="flex items-center justify-between gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-10 flex-1 text-sm"
                    aria-expanded={isExpanded}
                    onClick={() => toggleExpanded(item.id)}
                  >
                    <ChevronDown
                      className={cn(
                        "mr-1.5 h-4 w-4 transition-transform duration-200",
                        isExpanded && "rotate-180"
                      )}
                    />
                    {isExpanded ? "Ocultar parcelas" : "Ver parcelas"}
                  </Button>

                  <div className="flex shrink-0 gap-1">
                    <FixedPlanRenewButton
                      recurring={item}
                      onRenewed={reloadRecurring}
                      className="h-10 w-10"
                    />

                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn("h-10 w-10", ICON_EDIT_BUTTON_CLASS)}
                      aria-label="Editar recorrência"
                      onClick={() => {
                        setSelectedRecurring(item);
                        handleEditRecurring(item);
                      }}
                    >
                      <Pen className="h-4 w-4" />
                    </Button>

                    <AlertDialog
                      open={confirmOpenSoft && selectedRecurring?.id === item.id}
                      onOpenChange={setConfirmOpenSoft}
                    >
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-10 w-10"
                          aria-label={copy.archiveLabel}
                          onClick={() => setSelectedRecurring(item)}
                        >
                          <CheckCircle className="h-4 w-4 text-success" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>{copy.archiveTitle}</AlertDialogHeader>
                        <p className="text-sm text-muted-foreground">
                          A recorrência &quot;{displayName}&quot; será arquivada como concluída.
                        </p>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={async () => {
                              await softDeleteRecurring(item.id);
                              setConfirmOpenSoft(false);
                              reloadRecurring();
                            }}
                          >
                            {copy.archiveConfirm}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>

                    <AlertDialog
                      open={confirmOpen && selectedRecurring?.id === item.id}
                      onOpenChange={setConfirmOpen}
                    >
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-10 w-10"
                          aria-label="Excluir recorrência"
                          onClick={() => setSelectedRecurring(item)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>Excluir recorrência?</AlertDialogHeader>
                        <p className="text-sm text-muted-foreground">
                          Esta ação é permanente e não pode ser desfeita.
                        </p>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={async () => {
                              await deleteRecurringApi(item.id);
                              setConfirmOpen(false);
                              reloadRecurring();
                            }}
                          >
                            Excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>

                {isExpanded && (
                  <div className="overflow-hidden rounded-lg border border-border/50 bg-background/60">
                    <div className="border-b border-border/40 px-3 py-2 text-xs text-muted-foreground">
                      {remainingInfo ? (
                        <span>
                          {remainingInfo.paid}/{remainingInfo.total}{" "}
                          {copy.progressPaidLabel} · resto{" "}
                          <span className="font-medium tabular-nums text-foreground">
                            {formatBRL(remainingInfo.remainingAmount)}
                          </span>
                        </span>
                      ) : (
                        "Parcelas"
                      )}
                    </div>
                    {typeof installments === "string" ? (
                      <p className="px-3 py-3 text-sm text-muted-foreground">{installments}</p>
                    ) : Array.isArray(installments) ? (
                      <div className="divide-y divide-border/40">
                        {installments.map((installment: Installment) => {
                          const isPaid = paidParcels.includes(installment.number);
                          return (
                            <div
                              key={installment.number}
                              className="flex items-center gap-2 px-3 py-2.5 text-sm"
                            >
                              <span className="w-5 shrink-0 tabular-nums text-muted-foreground">
                                {installment.number}
                              </span>
                              <span className="min-w-0 flex-1 text-muted-foreground">
                                {item.frequency === "Anual"
                                  ? installment.dueDate.slice(0, 4)
                                  : installment.dueDate
                                      .split("-")
                                      .reverse()
                                      .join("/")}
                              </span>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "shrink-0 font-normal text-[10px]",
                                  isPaid
                                    ? "border-success/30 text-success"
                                    : "border-border text-muted-foreground"
                                )}
                              >
                                {isPaid ? copy.doneBadge : copy.openBadge}
                              </Badge>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 shrink-0 px-2.5 text-xs"
                                onClick={() => {
                                  setSelectedParcel({
                                    transactionId: item.id,
                                    installmentNumber: installment.number,
                                  });
                                  setPaymentAction(isPaid ? "unmark" : "mark");
                                  setConfirmPaymentOpen(true);
                                }}
                              >
                                {isPaid ? "Desfazer" : copy.action}
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="px-3 py-3 text-sm text-muted-foreground">Sem parcelas calculadas.</p>
                    )}
                  </div>
                )}
              </MobileStackRow>
            );
          })}
        </MobileStackList>

        <AlertDialog open={confirmPaymentOpen} onOpenChange={setConfirmPaymentOpen}>
          <AlertDialogContent>
            {(() => {
              const parcelRec = recurring.find(
                (r) => r.id === selectedParcel?.transactionId
              );
              const parcelCopy = parcelRec
                ? getRecurringActionCopy(parcelRec)
                : getActionCopyBySide(false);
              return (
                <>
                  <AlertDialogHeader>
                    {paymentAction === "mark"
                      ? parcelCopy.markTitle
                      : parcelCopy.unmarkTitle}
                  </AlertDialogHeader>
                  <p className="text-sm text-muted-foreground">
                    {paymentAction === "mark"
                      ? parcelCopy.markHint
                      : parcelCopy.unmarkHint}
                  </p>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => void onConfirmParcelPayment()}
                    >
                      Confirmar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </>
              );
            })()}
          </AlertDialogContent>
        </AlertDialog>
      </TooltipProvider>

  );
}
