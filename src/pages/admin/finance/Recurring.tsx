import { RecurringFormDialog } from "@/pages/admin/finance/components/RecurringFormDialog";
import { RecurringTable } from "@/pages/admin/finance/components/RecurringTable";
import { RecurringFilters } from "@/pages/admin/finance/components/RecurringFilters";
import { useEffect, useMemo, useState } from "react";
import {
  calculateInstallments,
  fetchRecurringTransactions,
  sumRecurringByNature,
  fetchDimensions,
  updateRecurringApi,
  createRecurringApi,
  getRecurringDueAlerts,
  resolvePaymentStartDate,
  filterRecurringList,
  getRecurringProgress,
  type RecurringFilter,
} from "@/api/recurring";
import { RecurringSummary } from "./components/RecurringSummary";
import { RecurringDueAlerts } from "./components/RecurringDueAlerts";
import type { Dimension, Recurring, RecurringCreateRequest } from "@/types/recurring";
import { toast } from "@/hooks/use-toast";
import { PAGE_HEADER_ACTIONS_CLASS } from "@/components/FormLabel";

export default function Recurring() {
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
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
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
    }
  };

  const fetchAndSetDimensions = async () => {
    try {
      const dims = await fetchDimensions();
      setDimensions(dims);
    } catch (err) {
      console.error("Erro ao buscar dimensões:", err);
    }
  };

  useEffect(() => {
    reloadRecurring();
    fetchAndSetDimensions();
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

  async function editRecurring() {
    if (!selectedRecurring) return;

    try {
      await updateRecurringApi(selectedRecurring.id, newRecurring);
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

  async function handleCreateRecurring() {
    try {
      await createRecurringApi(newRecurring);
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
    <main className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 overflow-x-hidden">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Recorrências</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie receitas e despesas fixas do seu planejamento financeiro.
          </p>
        </div>

        <div className={PAGE_HEADER_ACTIONS_CLASS}>
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
        </div>
      </section>

      <RecurringSummary
        totalFixesReceivable={totalFixesReceivable}
        totalFixesPay={totalFixesPay}
      />

      <RecurringDueAlerts alerts={dueAlerts} />

      <section className="space-y-3">
        <RecurringFilters
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
          counts={filterCounts}
        />

        <div className="w-full min-w-0 overflow-x-auto rounded-xl border border-border/60 bg-card/30">
          <RecurringTable
            recurring={filteredRecurring}
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
    </main>
  );
}
