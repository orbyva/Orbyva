import { Trash2, Pen, Receipt } from "lucide-react";
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
import { TypeIcon } from "@/components/TypeIcon";
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
  return (
    <TypeIcon
      name={transaction.class?.type?.lucide_icon}
      className="h-4 w-4 shrink-0"
      style={{ color: String(transaction.class?.type?.hex_color ?? "") }}
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
          ? "border-success/30 text-success"
          : "border-destructive/30 text-destructive"
      )}
    >
      {nature}
    </Badge>
  );
}

function TransactionActions({
  transaction,
  confirmOpen,
  setConfirmOpen,
  selectedTransaction,
  setSelectedTransaction,
  deleteTransaction,
  deleteLoading,
  handleEdit,
}: {
  transaction: Transaction;
  confirmOpen: boolean;
  setConfirmOpen: (open: boolean) => void;
  selectedTransaction: Transaction | null;
  setSelectedTransaction: (transaction: Transaction | null) => void;
  deleteTransaction: () => void;
  deleteLoading: string | null;
  handleEdit: (transaction: Transaction) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <ActionTooltip label="Editar">
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10"
          aria-label="Editar transação"
          onClick={() => handleEdit(transaction)}
        >
          <Pen className="h-4 w-4 text-blue-400" />
        </Button>
      </ActionTooltip>

      <AlertDialog
        open={confirmOpen && selectedTransaction?.id === transaction.id}
        onOpenChange={setConfirmOpen}
      >
        <ActionTooltip label="Excluir">
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10"
              aria-label="Excluir transação"
              onClick={() => setSelectedTransaction(transaction)}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </AlertDialogTrigger>
        </ActionTooltip>
        <AlertDialogContent>
          <AlertDialogHeader>Excluir transação?</AlertDialogHeader>
          <p className="text-sm text-muted-foreground">
            {transaction.description || "Esta transação"} —{" "}
            {formatBRL(transaction.value)}. Esta ação não pode ser desfeita.
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmOpen(false)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteTransaction}
              disabled={deleteLoading === String(transaction.id)}
            >
              {deleteLoading === String(transaction.id)
                ? "Excluindo..."
                : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TransactionsMobileList({
  transactions,
  confirmOpen,
  setConfirmOpen,
  selectedTransaction,
  setSelectedTransaction,
  deleteTransaction,
  deleteLoading,
  handleEdit,
}: Omit<TransactionsTableProps, "isMobile">) {
  return (
    <div className="divide-y divide-border/60">
      {transactions.map((t) => {
        const nature = t.class?.type?.nature?.name ?? "";
        const isReceita = nature === "Receita";
        const dateStr = t.transaction_at.includes("T")
          ? t.transaction_at.split("T")[0]
          : t.transaction_at.slice(0, 10);

        return (
          <div key={t.id} className="flex flex-col gap-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <TransactionIcon transaction={t} />
                <div className="min-w-0 space-y-1.5">
                  <p className="font-medium leading-snug line-clamp-2">
                    {t.description || "—"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t.class?.type?.name} · {t.class?.name}
                  </p>
                  {nature && <NatureBadge nature={nature} />}
                </div>
              </div>
              <span
                className={cn(
                  "shrink-0 text-base font-semibold tabular-nums",
                  isReceita ? "text-success" : "text-destructive"
                )}
              >
                {formatBRL(t.value)}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground tabular-nums">
                {formatDateBR(dateStr)}
              </span>
              <TransactionActions
                transaction={t}
                confirmOpen={confirmOpen}
                setConfirmOpen={setConfirmOpen}
                selectedTransaction={selectedTransaction}
                setSelectedTransaction={setSelectedTransaction}
                deleteTransaction={deleteTransaction}
                deleteLoading={deleteLoading}
                handleEdit={handleEdit}
              />
            </div>
          </div>
        );
      })}
    </div>
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

  if (isMobile) {
    return (
      <TooltipProvider delayDuration={300}>
        <TransactionsMobileList
          transactions={transactions}
          confirmOpen={confirmOpen}
          setConfirmOpen={setConfirmOpen}
          selectedTransaction={selectedTransaction}
          setSelectedTransaction={setSelectedTransaction}
          deleteTransaction={deleteTransaction}
          deleteLoading={deleteLoading}
          handleEdit={handleEdit}
        />
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="w-full overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10" />
              <TableHead>Natureza</TableHead>
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

                  <TableCell>
                    <NatureBadge nature={nature} />
                  </TableCell>

                  <TableCell className="font-medium">
                    {t.class?.type?.name}
                  </TableCell>

                  <TableCell className="text-muted-foreground">
                    {t.class?.name}
                  </TableCell>

                  <TableCell
                    className={cn(
                      "whitespace-nowrap font-medium tabular-nums",
                      isReceita ? "text-success" : "text-destructive"
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
                    <div className="flex items-center justify-end">
                      <TransactionActions
                        transaction={t}
                        confirmOpen={confirmOpen}
                        setConfirmOpen={setConfirmOpen}
                        selectedTransaction={selectedTransaction}
                        setSelectedTransaction={setSelectedTransaction}
                        deleteTransaction={deleteTransaction}
                        deleteLoading={deleteLoading}
                        handleEdit={handleEdit}
                      />
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
