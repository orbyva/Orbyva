import { RecurringFormDialog } from "@/pages/admin/finance/components/RecurringFormDialog";
import { RecurringTable } from "@/pages/admin/finance/components/RecurringTable";
import { RecurringFilters } from "@/pages/admin/finance/components/RecurringFilters";
import { useEffect, useMemo, useState } from "react";
import {
  calculateInstallments,
  fetchRecurringTransactions,
  sumRecurringByNature,
  updateRecurringApi,
  createRecurringApi,
  getRecurringDueAlerts,
  resolvePaymentStartDate,
  filterRecurringList,
  getRecurringProgress,
  type RecurringFilter,
} from "@/api/recurring";
import { useDimensions } from "@/hooks/useDimensions";
import { RecurringSummary } from "./components/RecurringSummary";
import { RecurringDueAlerts } from "./components/RecurringDueAlerts";
import type { Recurring, RecurringCreateRequest } from "@/types/recurring";
import { toast } from "@/hooks/use-toast";
import { PageShell } from "@/components/PageShell";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/errors";
import { useSidebar } from "@/components/ui/sidebar";
import { Repeat } from "lucide-react";

export default function Recurring() {
  const { isMobile } = useSidebar();
  const { dimensions } = useDimensions();
  const [recurring, setRecurring] = useState<Recurring[]>([]);
  const [activeFilter, setActiveFilter] = useState<RecurringFilter>("all");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmOpenSoft, setConfirmOpenSoft] = useState(false);
  const [confirmPaymentOpen, setConfirmPaymentOpen] = useState(false);
  const [selectedRecurring, setSelectedRecurring] = useState<Recurring | null>(null);
  const [open, setOpen] = useState(false);
  const [totalFixesPay, setTotalFixesPay] = useState(0);
  const [totalFixesReceivable, setTotalFixesReceivable] = useState(0);

  const new_recurring_default: RecurringCreateRequest = {
    class_id: 0,
    value: 0,
    description: "",
    frequency: "",
    validity: null,
    due_day: null,
    installment_count: null,
    payment_start_date: new Date().toISOString().split("T")[0],
    status: true,
  };

  const [newRecurring, setNewRecurring] =
    useState<RecurringCreateRequest>(new_recurring_default);

  const [isEditing, setIsEditing] = useState(false);
  const [selectedParcel, setSelectedParcel] = useState<{
    transactionId: string;
    installmentNumber: number;
  } | null>(null);

  const reloadRecurring = async () => {
    try {
      const data = await fetchRecurringTransactions();
      const withInstallments = data.map((rec) => ({
        ...rec,
        installments: calculateInstallments(
          resolvePaymentStartDate(rec),
          rec.due_day,
          rec.installment_count,
          rec.validity
        ),
      }));

      setRecurring(withInstallments);

      const summary = await sumRecurringByNature();
      setTotalFixesPay(summary.totalFixesPay);
      setTotalFixesReceivable(summary.totalFixesReceivable);
    } catch (err) {
      console.error("Erro ao buscar recorrências:", err);
      toast({
        variant: "destructive",
        title: "Erro ao carregar recorrências",
        description: getErrorMessage(err),
      });
    }
  };

  useEffect(() => {
    reloadRecurring();
  }, []);

  const dueAlerts = useMemo(
    () => getRecurringDueAlerts(recurring),
    [recurring]
  );

  const filterCounts = useMemo(() => {
    const overdueIds = new Set(
      dueAlerts.filter((a) => a.status === "overdue").map((a) => a.recurring.id)
    );
    const upcomingIds = new Set(
      dueAlerts.filter((a) => a.status === "upcoming").map((a) => a.recurring.id)
    );

    return {
      all: recurring.length,
      open: recurring.filter((rec) => {
        const progress = getRecurringProgress(rec);
        return !progress || progress.open > 0;
      }).length,
      paid: recurring.filter((rec) => {
        const progress = getRecurringProgress(rec);
        return progress !== null && progress.open === 0 && progress.total > 0;
      }).length,
      upcoming: recurring.filter((rec) => upcomingIds.has(rec.id)).length,
      overdue: recurring.filter((rec) => overdueIds.has(rec.id)).length,
    } satisfies Record<RecurringFilter, number>;
  }, [recurring, dueAlerts]);

  const filteredRecurring = useMemo(
    () => filterRecurringList(recurring, activeFilter, dueAlerts),
    [recurring, activeFilter, dueAlerts]
  );

  async function editRecurring(payload?: RecurringCreateRequest) {
    if (!selectedRecurring) return;
    const data = payload ?? newRecurring;

    try {
      await updateRecurringApi(selectedRecurring.id, data);
      toast({
        title: "Sucesso",
        description: "Recorrência atualizada com sucesso!",
        duration: 2000,
      });

      reloadRecurring();
      setOpen(false);
      setIsEditing(false);
      setSelectedRecurring(null);
    } catch (error) {
      toast({
        title: "Erro",
        description: `Falha ao editar recorrência: ${error}`,
        variant: "destructive",
        duration: 2000,
      });
    }
  }

  function handleEdit(recurringItem: Recurring) {
    setSelectedRecurring(recurringItem);
    setNewRecurring({
      class_id: recurringItem.class.id,
      value: recurringItem.value,
      description: recurringItem.description,
      frequency: recurringItem.frequency,
      validity: recurringItem.validity,
      due_day: recurringItem.due_day,
      installment_count: recurringItem.installment_count,
      payment_start_date: recurringItem.payment_start_date,
      status: true,
    });
    setIsEditing(true);
    setOpen(true);
  }

  async function handleCreateRecurring(payload?: RecurringCreateRequest) {
    const data = payload ?? newRecurring;
    try {
      await createRecurringApi(data);
      toast({
        title: "Sucesso",
        description: "Recorrência adicionada com sucesso!",
        duration: 2000,
      });

      reloadRecurring();
      setOpen(false);
      setNewRecurring(new_recurring_default);
    } catch (error) {
      toast({
        title: "Erro",
        description: `Falha ao adicionar recorrência: ${error}`,
        variant: "destructive",
        duration: 2000,
      });
    }
  }

  function handleCloseForm() {
    setOpen(false);
    setIsEditing(false);
    setSelectedRecurring(null);
    setNewRecurring(new_recurring_default);
  }

  return (
    <PageShell
      title="Recorrências"
      description="Gerencie receitas e despesas fixas do seu planejamento financeiro."
      actions={
        <RecurringFormDialog
          open={open}
          setOpen={setOpen}
          newRecurring={newRecurring}
          setNewRecurring={setNewRecurring}
          createRecurring={isEditing ? editRecurring : handleCreateRecurring}
          isEditing={isEditing}
          onClose={handleCloseForm}
          dimensions={dimensions}
        />
      }
    >
      <RecurringSummary
        totalFixesReceivable={totalFixesReceivable}
        totalFixesPay={totalFixesPay}
      />

      <RecurringDueAlerts alerts={dueAlerts} />

      {recurring.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title="Nenhuma parcela ou recorrência"
          description="Cadastre receitas e despesas fixas para o ledger avisar vencimentos — continua o onboarding do life OS."
          action={
            <Button
              onClick={() => {
                setIsEditing(false);
                setSelectedRecurring(null);
                setNewRecurring(new_recurring_default);
                setOpen(true);
              }}
            >
              Nova recorrência
            </Button>
          }
        />
      ) : (
        <section className="space-y-3">
          <RecurringFilters
            activeFilter={activeFilter}
            onFilterChange={setActiveFilter}
            counts={filterCounts}
          />

          <div className="w-full min-w-0 overflow-x-auto rounded-xl border border-border/60 bg-card/30">
            <RecurringTable
              recurring={filteredRecurring}
              isMobile={isMobile}
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
              handleEditRecurring={handleEdit}
            />
          </div>
        </section>
      )}
    </PageShell>
  );
}
