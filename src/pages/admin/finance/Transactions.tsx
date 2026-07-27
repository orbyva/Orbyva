import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { RefreshCw, Loader2, Search } from "lucide-react";

import { useToast } from "@/hooks/use-toast";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Pagination from "./components/Pagination";
import { useSidebar } from "@/components/ui/sidebar";
import { Transaction, TransactionCreateRequest } from "@/types/finance";
import { TransactionsTable } from "./components/TransactionsTable";
import { useTransactions } from "@/hooks/database/useTransactions";
import { TransactionFormDialog } from "./components/TransactionFormDialog";
import { FinanceImportDialog } from "./components/FinanceImportDialog";
import {
  createTransactionApi,
  deleteTransactionApi,
  updateTransactionApi,
} from "@/api/finance";
import { useDimensions } from "@/hooks/useDimensions";
import { TableLoadingSkeleton } from "@/components/TableLoadingSkeleton";
import { getErrorMessage } from "@/lib/errors";
import { track } from "@/lib/analytics";

type NatureFilter = "all" | "Receita" | "Despesa" | "Investimento";

export default function Transactions() {
  const { toast } = useToast();
  const { isMobile } = useSidebar();
  const { dimensions } = useDimensions();
  const [searchParams, setSearchParams] = useSearchParams();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [natureFilter, setNatureFilter] = useState<NatureFilter>("all");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, natureFilter, pageSize]);

  const {
    transactions,
    setTransactions,
    loadingTransactions,
    totalPages,
    fromCache,
    refetchTransactions,
  } = useTransactions({
    page,
    pageSize,
    search: debouncedSearch,
    nature: natureFilter === "all" ? null : natureFilter,
  });

  const new_transaction_default: TransactionCreateRequest = {
    class_id: 0,
    value: 0,
    description: "",
    transaction_at: new Date().toISOString(),
  };

  const [newTransaction, setNewTransaction] =
    useState<TransactionCreateRequest>(new_transaction_default);

  const [formOpen, setOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
  const [selectedTransaction, setSelectedTransaction] =
    useState<Transaction | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    const prefillDesc = searchParams.get("desc") ?? "";
    const prefillValue = Number(searchParams.get("value"));
    setIsEditing(false);
    setSelectedTransaction(null);
    setNewTransaction({
      class_id: 0,
      value:
        Number.isFinite(prefillValue) && prefillValue > 0
          ? Math.round(prefillValue * 100) / 100
          : 0,
      description: prefillDesc,
      transaction_at: new Date().toISOString(),
    });
    setOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete("new");
    next.delete("desc");
    next.delete("value");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  async function createTransaction() {
    try {
      const result = await createTransactionApi(newTransaction);
      track("quick_add_done", { source: isEditing ? "edit" : "create" });
      toast({
        title: result.queued ? "Salvo offline" : "Sucesso",
        description: result.queued
          ? "Sem rede — o lançamento entra na fila e sincroniza quando você voltar online."
          : "Transação adicionada com sucesso!",
        duration: result.queued ? 3500 : 2000,
      });

      refetchTransactions();
      setOpen(false);
      setNewTransaction(new_transaction_default);
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Falha ao adicionar transação."),
        variant: "destructive",
        duration: 2000,
      });
    }
  }

  async function deleteTransaction() {
    if (!selectedTransaction) return;

    setDeleteLoading(String(selectedTransaction.id));
    setConfirmOpen(false);

    try {
      await deleteTransactionApi(selectedTransaction.id);
      setTransactions((prev) =>
        prev.filter((t) => t.id !== selectedTransaction.id)
      );

      toast({
        title: "Deletado",
        description: "Transação removida com sucesso!",
        duration: 2000,
      });
      refetchTransactions();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Falha ao excluir transação."),
        variant: "destructive",
        duration: 2000,
      });
    } finally {
      setDeleteLoading(null);
      setSelectedTransaction(null);
    }
  }

  async function editTransaction() {
    if (!selectedTransaction) return;

    try {
      await updateTransactionApi(String(selectedTransaction.id), newTransaction);
      toast({
        title: "Sucesso",
        description: "Transação atualizada com sucesso!",
        duration: 2000,
      });

      refetchTransactions();
      setOpen(false);
      setIsEditing(false);
      setSelectedTransaction(null);
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Falha ao editar transação."),
        variant: "destructive",
        duration: 2000,
      });
    }
  }

  function handleEdit(transaction: Transaction) {
    setSelectedTransaction(transaction);
    setNewTransaction({
      class_id: transaction.class.id,
      value: transaction.value,
      description: transaction.description,
      transaction_at: new Date(transaction.transaction_at).toISOString(),
    });
    setIsEditing(true);
    setOpen(true);
  }

  function handleCloseForm() {
    setIsEditing(false);
    setSelectedTransaction(null);
    setNewTransaction(new_transaction_default);
  }

  const natureFilters: { id: NatureFilter; label: string }[] = [
    { id: "all", label: "Todas" },
    { id: "Receita", label: "Receitas" },
    { id: "Despesa", label: "Despesas" },
    { id: "Investimento", label: "Investimentos" },
  ];

  return (
    <PageShell
      title="Transações"
      description="Registre, edite e acompanhe suas movimentações financeiras."
      actions={
        <>
          <Button
            onClick={refetchTransactions}
            variant="outline"
            disabled={loadingTransactions}
          >
            {loadingTransactions ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Atualizar
          </Button>

          <FinanceImportDialog onImported={refetchTransactions} />

          <TransactionFormDialog
            open={formOpen}
            setOpen={setOpen}
            newTransaction={newTransaction}
            setNewTransaction={setNewTransaction}
            createTransaction={isEditing ? editTransaction : createTransaction}
            dimensions={dimensions}
            isEditing={isEditing}
            onClose={handleCloseForm}
          />
        </>
      }
    >
      <section className="space-y-3">
        {fromCache ? (
          <p className="text-xs text-muted-foreground">
            Sem conexão — mostrando o último ledger salvo neste dispositivo.
          </p>
        ) : null}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por descrição, tipo ou classe..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {natureFilters.map(({ id, label }) => (
              <Button
                key={id}
                type="button"
                size="sm"
                variant={natureFilter === id ? "default" : "outline"}
                className="h-10 rounded-full px-3 text-sm sm:h-8 sm:text-xs"
                onClick={() => setNatureFilter(id)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>

        <div className="w-full min-w-0 overflow-x-auto rounded-xl border border-border/60 bg-card/30">
          {loadingTransactions ? (
            <TableLoadingSkeleton rows={6} columns={7} />
          ) : (
            <TransactionsTable
              transactions={transactions}
              isMobile={isMobile}
              confirmOpen={confirmOpen}
              setConfirmOpen={setConfirmOpen}
              selectedTransaction={selectedTransaction}
              setSelectedTransaction={setSelectedTransaction}
              deleteTransaction={deleteTransaction}
              deleteLoading={deleteLoading}
              handleEdit={handleEdit}
            />
          )}
        </div>
      </section>

      <Pagination
        page={page}
        pageSize={pageSize}
        totalPages={totalPages}
        onSetPage={setPage}
        onSetPageSize={setPageSize}
      />
    </PageShell>
  );
}
