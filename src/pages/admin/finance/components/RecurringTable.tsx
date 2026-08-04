import { ChevronDown, CheckCircle, Pen, Trash2, Repeat, ArrowUpDown } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import {
  TooltipProvider,
} from "@/components/ui/tooltip";
import { EmptyState } from "@/components/EmptyState";
import {
  deleteRecurringApi,
  softDeleteRecurring,
  updateRecurringParcelPayment,
  formatInstallmentPlanSummary,
  getRecurringProgress,
} from "@/api/recurring";
import type {
  RecurringSortKey,
  RecurringSortState,
} from "@/domain/recurring/listView";
import { formatBRL } from "@/lib/currency";
import { Fragment, useState } from "react";
import { Installment, Recurring } from "@/types/recurring";
import { cn } from "@/lib/utils";
import { ActionTooltip } from "@/components/ActionTooltip";
import { ICON_EDIT_BUTTON_CLASS } from "@/components/FormLabel";
import { toast } from "@/hooks/use-toast";
import {
  RecurringIcon,
  ProgressBar,
  FixedPlanRenewButton,
  getRemainingInfo,
  getRecurringActionCopy,
  getActionCopyBySide,
} from "./RecurringTableShared";
import { RecurringTableMobile } from "./RecurringTableMobile";

interface RecurringTableProps {
  recurring: Recurring[];
  isMobile?: boolean;
  sort: RecurringSortState;
  onSortChange: (key: RecurringSortKey) => void;
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
  handleEditRecurring: (recurring: Recurring) => void;
}

function SortableHead({
  label,
  sortKey,
  sort,
  onSortChange,
  className,
}: {
  label: string;
  sortKey: RecurringSortKey;
  sort: RecurringSortState;
  onSortChange: (key: RecurringSortKey) => void;
  className?: string;
}) {
  const active = sort.key === sortKey;
  return (
    <TableHead className={className}>
      <Button
        type="button"
        variant="ghost"
        className={cn(
          "-ml-3 h-8 px-3 text-xs font-medium hover:bg-transparent",
          active && "text-foreground"
        )}
        onClick={() => onSortChange(sortKey)}
      >
        {label}
        <ArrowUpDown
          className={cn(
            "ml-1.5 h-3.5 w-3.5",
            active ? "opacity-100" : "opacity-40"
          )}
        />
        <span className="sr-only">
          {active
            ? sort.dir === "asc"
              ? "ordenado crescente"
              : "ordenado decrescente"
            : "ordenar"}
        </span>
      </Button>
    </TableHead>
  );
}

export function RecurringTable({
  recurring,
  isMobile = false,
  sort,
  onSortChange,
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
  handleEditRecurring,
}: RecurringTableProps) {
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [paymentAction, setPaymentAction] = useState<"mark" | "unmark" | null>(
    null
  );

  function toggleExpanded(id: string) {
    setExpandedRows((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  if (recurring.length === 0) {
    return (
      <EmptyState
        icon={Repeat}
        title="Nenhuma recorrência neste filtro"
        description="Ajuste o filtro ou cadastre uma parcela/recorrência para acompanhar o mês."
      />
    );
  }

  if (isMobile) {
    return (
      <RecurringTableMobile
        recurring={recurring}
        confirmOpen={confirmOpen}
        setConfirmOpen={setConfirmOpen}
        confirmOpenSoft={confirmOpenSoft}
        setConfirmOpenSoft={setConfirmOpenSoft}
        confirmPaymentOpen={confirmPaymentOpen}
        setConfirmPaymentOpen={setConfirmPaymentOpen}
        selectedRecurring={selectedRecurring}
        setSelectedRecurring={setSelectedRecurring}
        selectedParcel={selectedParcel}
        setSelectedParcel={setSelectedParcel}
        reloadRecurring={reloadRecurring}
        handleEditRecurring={handleEditRecurring}
        expandedRows={expandedRows}
        toggleExpanded={toggleExpanded}
        paymentAction={paymentAction}
        setPaymentAction={setPaymentAction}
      />
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="w-full overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10" />
              <SortableHead
                label="Tipo"
                sortKey="type"
                sort={sort}
                onSortChange={onSortChange}
              />
              <TableHead>Classe</TableHead>
              <SortableHead
                label="Valor"
                sortKey="value"
                sort={sort}
                onSortChange={onSortChange}
              />
              <TableHead className="min-w-[140px]">Descrição</TableHead>
              <SortableHead
                label="Frequência"
                sortKey="frequency"
                sort={sort}
                onSortChange={onSortChange}
              />
              <SortableHead
                label="Parcelas"
                sortKey="installments"
                sort={sort}
                onSortChange={onSortChange}
                className="min-w-[200px]"
              />
              <SortableHead
                label="Saldo"
                sortKey="balance"
                sort={sort}
                onSortChange={onSortChange}
                className="min-w-[160px]"
              />
              <TableHead className="w-[148px] text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
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
                <Fragment key={item.id}>
                  <TableRow className="align-top [&>td]:py-4">
                    <TableCell className="pt-5">
                      <RecurringIcon recurring={item} />
                    </TableCell>

                    <TableCell className="font-medium">
                      {item.class?.type?.name || "Sem Tipo"}
                    </TableCell>

                    <TableCell className="text-muted-foreground">
                      {item.class?.name || "Sem Classe"}
                    </TableCell>

                    <TableCell className="whitespace-nowrap font-medium tabular-nums">
                      {formatBRL(item.value ?? 0)}
                    </TableCell>

                    <TableCell>
                      <span className="line-clamp-2 font-medium leading-snug">
                        {displayName}
                      </span>
                    </TableCell>

                    <TableCell className="text-muted-foreground">
                      {item.frequency}
                    </TableCell>

                    <TableCell>
                      {planSummary ? (
                        <div className="min-w-[180px] space-y-0.5">
                          <span className="font-medium">{planSummary.title}</span>
                          <p className="text-xs leading-relaxed text-muted-foreground">
                            {planSummary.subtitle}
                          </p>
                          {progress && (
                            <ProgressBar
                              progress={progress}
                              paidWord={copy.progressPaidLabel}
                            />
                          )}
                        </div>
                      ) : typeof item.validity === "string" &&
                        item.validity !== "Invalid Date" ? (
                        <span className="text-sm text-muted-foreground">
                          Legado · até{" "}
                          {item.validity.split("-").reverse().join("/")}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          Sem parcelamento
                        </span>
                      )}
                    </TableCell>

                    <TableCell>
                      {remainingInfo ? (
                        <div className="space-y-1">
                          <p className="whitespace-nowrap text-sm font-medium tabular-nums">
                            {formatBRL(remainingInfo.remainingAmount)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {remainingInfo.open}x de {formatBRL(item.value)}
                          </p>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center justify-end gap-0.5">
                        <FixedPlanRenewButton
                          recurring={item}
                          onRenewed={reloadRecurring}
                          className="focus-visible:ring-primary"
                        />

                        <ActionTooltip label="Editar">
                          <Button
                            variant="ghost"
                            size="icon"
                            className={cn(
                              "h-8 w-8 focus-visible:ring-primary",
                              ICON_EDIT_BUTTON_CLASS
                            )}
                            aria-label="Editar recorrência"
                            onClick={() => {
                              setSelectedRecurring(item);
                              handleEditRecurring(item);
                            }}
                          >
                            <Pen className="h-4 w-4" />
                          </Button>
                        </ActionTooltip>

                        <AlertDialog
                          open={
                            confirmOpenSoft && selectedRecurring?.id === item.id
                          }
                          onOpenChange={setConfirmOpenSoft}
                        >
                          <ActionTooltip label={copy.archiveLabel}>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 focus-visible:ring-primary"
                                aria-label={copy.archiveLabel}
                                onClick={() => setSelectedRecurring(item)}
                              >
                                <CheckCircle className="h-4 w-4 text-success" />
                              </Button>
                            </AlertDialogTrigger>
                          </ActionTooltip>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              {copy.archiveTitle}
                            </AlertDialogHeader>
                            <p className="text-sm text-muted-foreground">
                              A recorrência &quot;{displayName}&quot; será
                              arquivada como concluída.
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
                          <ActionTooltip label="Excluir">
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 focus-visible:ring-primary"
                                aria-label="Excluir recorrência"
                                onClick={() => setSelectedRecurring(item)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                          </ActionTooltip>
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

                        <ActionTooltip
                          label={
                            isExpanded ? "Recolher parcelas" : "Expandir parcelas"
                          }
                        >
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 focus-visible:ring-primary"
                            aria-label={
                              isExpanded ? "Recolher parcelas" : "Expandir parcelas"
                            }
                            aria-expanded={isExpanded}
                            onClick={() => toggleExpanded(item.id)}
                          >
                            <ChevronDown
                              className={cn(
                                "h-4 w-4 transition-transform duration-200",
                                isExpanded && "rotate-180"
                              )}
                            />
                          </Button>
                        </ActionTooltip>
                      </div>
                    </TableCell>
                  </TableRow>

                  {isExpanded && (
                    <TableRow className="hover:bg-transparent bg-muted/15">
                      <TableCell colSpan={9} className="px-3 py-2 sm:px-4">
                        <div className="overflow-hidden rounded-lg border border-border/50 bg-background/60">
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 px-3 py-2 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">
                              {displayName}
                            </span>
                            {remainingInfo ? (
                              <span>
                                {remainingInfo.paid}/{remainingInfo.total}{" "}
                                {copy.progressPaidLabel} · resto{" "}
                                <span className="font-medium tabular-nums text-foreground">
                                  {formatBRL(remainingInfo.remainingAmount)}
                                </span>
                              </span>
                            ) : null}
                          </div>

                          {typeof installments === "string" ? (
                            <p className="px-3 py-3 text-sm text-muted-foreground">
                              {installments}
                            </p>
                          ) : Array.isArray(installments) ? (
                            <div className="divide-y divide-border/40">
                              {installments.map((installment: Installment) => {
                                const isPaid = paidParcels.includes(
                                  installment.number
                                );

                                return (
                                  <div
                                    key={installment.number}
                                    className="flex items-center gap-3 px-3 py-2 text-sm"
                                  >
                                    <span className="w-6 shrink-0 tabular-nums text-muted-foreground">
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
                                      {isPaid
                                        ? copy.doneBadge
                                        : copy.openBadge}
                                    </Badge>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="h-7 shrink-0 px-2.5 text-xs"
                                      onClick={() => {
                                        setSelectedParcel({
                                          transactionId: item.id,
                                          installmentNumber:
                                            installment.number,
                                        });
                                        setPaymentAction(
                                          isPaid ? "unmark" : "mark"
                                        );
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
                            <p className="px-3 py-3 text-sm text-muted-foreground">
                              Sem parcelas calculadas.
                            </p>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>

        <AlertDialog
          open={confirmPaymentOpen}
          onOpenChange={setConfirmPaymentOpen}
        >
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
                      onClick={async () => {
                        if (selectedParcel) {
                          try {
                            await updateRecurringParcelPayment(
                              selectedParcel.transactionId,
                              selectedParcel.installmentNumber,
                              recurring.find(
                                (transaction) =>
                                  transaction.id === selectedParcel.transactionId
                              )?.paid_parcels || []
                            );
                            await reloadRecurring();
                            toast({
                              title:
                                paymentAction === "mark"
                                  ? parcelCopy.markToast
                                  : parcelCopy.unmarkToast,
                              description:
                                paymentAction === "mark"
                                  ? "A transação foi registrada automaticamente."
                                  : "A parcela foi revertida e a transação vinculada foi excluída.",
                            });
                          } catch (error) {
                            console.error(
                              "Erro ao atualizar pagamento da parcela:",
                              error
                            );
                            toast({
                              variant: "destructive",
                              title: "Erro ao atualizar parcela",
                              description:
                                "Não foi possível concluir a operação. Tente novamente.",
                            });
                          }
                        }
                        setConfirmPaymentOpen(false);
                      }}
                    >
                      Confirmar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </>
              );
            })()}
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
