import { Trash2, Pen, CircleDollarSign, Receipt } from "lucide-react";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Transaction } from "@/types/finance";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  TooltipProvider,
} from "@/components/ui/tooltip";
import { DynamicIcon, IconName } from "lucide-react/dynamic";
import { formatBRL, formatDateBR } from "@/lib/currency";
import { ActionTooltip } from "@/components/ActionTooltip";
import { EmptyState } from "@/components/EmptyState";
import { cn } from "@/lib/utils";

interface TransactionsTableProps {
  transactions: Transaction[];
  isMobile: boolean;
  confirmOpen: boolean;
  setConfirmOpen: (open: boolean) => void;
  selectedTransaction: Transaction | null;
  setSelectedTransaction: (transaction: Transaction | null) => void;
  deleteTransaction: () => void;
  deleteLoading: string | null;
  handleEdit: (transaction: Transaction) => void;
}

function TransactionIcon({ transaction }: { transaction: Transaction }) {
  if (transaction.class?.type?.lucide_icon) {
    return (
      <DynamicIcon
        name={transaction.class.type.lucide_icon as IconName}
        className="h-4 w-4"
        style={{ color: String(transaction.class.type.hex_color) }}
      />
    );
  }

  const isReceita = transaction.class?.type?.nature?.name === "Receita";
  return (
    <CircleDollarSign
      className={cn("h-4 w-4", isReceita ? "text-green-400" : "text-red-400")}
    />
  );
}

function NatureBadge({ nature }: { nature: string }) {
  const isReceita = nature === "Receita";
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-normal",
        isReceita
          ? "border-green-500/30 text-green-400"
          : "border-red-500/30 text-red-400"
      )}
    >
      {nature}
    </Badge>
  );
}

export function TransactionsTable({
  transactions,
  isMobile,
  confirmOpen,
  setConfirmOpen,
  selectedTransaction,
  setSelectedTransaction,
  deleteTransaction,
  deleteLoading,
  handleEdit,
}: TransactionsTableProps) {
  if (transactions.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title="Nenhuma transação encontrada"
        description="Adicione uma transação ou ajuste os filtros de busca."
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
              {!isMobile && <TableHead>Natureza</TableHead>}
              <TableHead>Tipo</TableHead>
              <TableHead>Classe</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead className="min-w-[120px]">Descrição</TableHead>
              <TableHead>Data</TableHead>
              <TableHead className="w-24 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((t) => {
              const nature = t.class?.type?.nature?.name ?? "";
              const isReceita = nature === "Receita";
              const dateStr = t.transaction_at.includes("T")
                ? t.transaction_at.split("T")[0]
                : t.transaction_at.slice(0, 10);

              return (
                <TableRow key={t.id} className="align-middle [&>td]:py-3.5">
                  <TableCell>
                    <TransactionIcon transaction={t} />
                  </TableCell>

                  {!isMobile && (
                    <TableCell>
                      <NatureBadge nature={nature} />
                    </TableCell>
                  )}

                  <TableCell className="font-medium">
                    {t.class?.type?.name}
                  </TableCell>

                  <TableCell className="text-muted-foreground">
                    {t.class?.name}
                  </TableCell>

                  <TableCell
                    className={cn(
                      "whitespace-nowrap font-medium tabular-nums",
                      isReceita ? "text-green-400" : "text-red-400"
                    )}
                  >
                    {formatBRL(t.value)}
                  </TableCell>

                  <TableCell>
                    <span className="line-clamp-2 leading-snug">
                      {t.description || "—"}
                    </span>
                  </TableCell>

                  <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                    {formatDateBR(dateStr)}
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center justify-end gap-0.5">
                      <ActionTooltip label="Editar">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label="Editar transação"
                          onClick={() => handleEdit(t)}
                        >
                          <Pen className="h-4 w-4 text-blue-400" />
                        </Button>
                      </ActionTooltip>

                      <AlertDialog
                        open={confirmOpen && selectedTransaction?.id === t.id}
                        onOpenChange={setConfirmOpen}
                      >
                        <ActionTooltip label="Excluir">
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label="Excluir transação"
                              onClick={() => setSelectedTransaction(t)}
                            >
                              <Trash2 className="h-4 w-4 text-red-400" />
                            </Button>
                          </AlertDialogTrigger>
                        </ActionTooltip>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            Excluir transação?
                          </AlertDialogHeader>
                          <p className="text-sm text-muted-foreground">
                            {t.description || "Esta transação"} —{" "}
                            {formatBRL(t.value)}. Esta ação não pode ser desfeita.
                          </p>
                          <AlertDialogFooter>
                            <AlertDialogCancel
                              onClick={() => setConfirmOpen(false)}
                            >
                              Cancelar
                            </AlertDialogCancel>
                            <AlertDialogAction
                              onClick={deleteTransaction}
                              disabled={deleteLoading === String(t.id)}
                            >
                              {deleteLoading === String(t.id)
                                ? "Excluindo..."
                                : "Excluir"}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  );
}
