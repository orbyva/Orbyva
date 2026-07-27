import { ChevronDown, CheckCircle, Pen, Trash2, Repeat } from "lucide-react";
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
  getRemainingInfo,
} from "./RecurringTableShared";
import { RecurringTableMobile } from "./RecurringTableMobile";

interface RecurringTableProps {
  recurring: Recurring[];
  isMobile?: boolean;
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

export function RecurringTable({
  recurring,
  isMobile = false,
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
              <TableHead>Tipo</TableHead>
              <TableHead>Classe</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead className="min-w-[140px]">Descrição</TableHead>
              <TableHead>Frequência</TableHead>
              <TableHead className="min-w-[200px]">Parcelas</TableHead>
              <TableHead className="min-w-[160px]">Saldo</TableHead>
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
                          {progress && <ProgressBar progress={progress} />}
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
                          <ActionTooltip label="Marcar recorrência como paga">
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 focus-visible:ring-primary"
                                aria-label="Marcar recorrência como paga"
                                onClick={() => setSelectedRecurring(item)}
                              >
                                <CheckCircle className="h-4 w-4 text-success" />
                              </Button>
                            </AlertDialogTrigger>
                          </ActionTooltip>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              Marcar como paga?
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
                                Marcar como paga
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
                    <TableRow className="hover:bg-transparent bg-muted/20">
                      <TableCell colSpan={9} className="px-4 py-4 sm:px-6">
                        <div className="rounded-lg border border-border/60 bg-card/50 p-4">
                          <div className="mb-4 space-y-1 border-b border-border/50 pb-3">
                            <h3 className="font-semibold">{displayName}</h3>
                            {remainingInfo ? (
                              <p className="text-sm text-muted-foreground">
                                {remainingInfo.paid} parcelas pagas ·{" "}
                                {remainingInfo.open} em aberto · Total restante{" "}
                                <span className="font-medium text-foreground tabular-nums">
                                  {formatBRL(remainingInfo.remainingAmount)}
                                </span>
                              </p>
                            ) : (
                              <p className="text-sm text-muted-foreground">
                                Sem parcelas configuradas
                              </p>
                            )}
                          </div>

                          {typeof installments === "string" ? (
                            <p className="text-sm text-muted-foreground">
                              {installments}
                            </p>
                          ) : Array.isArray(installments) ? (
                            <div className="space-y-2">
                              {installments.map((installment: Installment) => {
                                const isPaid = paidParcels.includes(
                                  installment.number
                                );

                                return (
                                  <div
                                    key={installment.number}
                                    className="flex flex-col gap-3 rounded-md border border-border/40 bg-background/40 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                                  >
                                    <div className="min-w-0 space-y-1">
                                      <p className="text-sm font-medium">
                                        Parcela {installment.number}
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        Vence em{" "}
                                        {installment.dueDate
                                          .split("-")
                                          .reverse()
                                          .join("/")}
                                      </p>
                                    </div>

                                    <div className="flex shrink-0 items-center gap-2">
                                      <Badge
                                        variant="outline"
                                        className={cn(
                                          "font-normal",
                                          isPaid
                                            ? "border-success/30 text-success"
                                            : "border-border text-muted-foreground"
                                        )}
                                      >
                                        {isPaid ? "Paga" : "Em aberto"}
                                      </Badge>

                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="h-7 text-xs"
                                        onClick={() => {
                                          setSelectedParcel({
                                            transactionId: item.id,
                                            installmentNumber: installment.number,
                                          });
                                          setPaymentAction(
                                            isPaid ? "unmark" : "mark"
                                          );
                                          setConfirmPaymentOpen(true);
                                        }}
                                      >
                                        {isPaid
                                          ? "Desfazer"
                                          : "Marcar como paga"}
                                      </Button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">
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
            <AlertDialogHeader>
              {paymentAction === "mark"
                ? "Marcar parcela como paga?"
                : "Desfazer pagamento?"}
            </AlertDialogHeader>

            <p className="text-sm text-muted-foreground">
              {paymentAction === "mark"
                ? "A transação correspondente será registrada automaticamente."
                : "O status da parcela será revertido e a transação vinculada será excluída automaticamente."}
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
                            ? "Parcela marcada como paga"
                            : "Pagamento desfeito",
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
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
