import { RecurringFormDialog } from "@/pages/admin/finance/components/RecurringFormDialog";
import { RecurringTable } from "@/pages/admin/finance/components/RecurringTable";
import { RecurringProjection } from "@/pages/admin/finance/components/RecurringProjection";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  calculateInstallments,
  fetchRecurringTransactions,
  fetchLastPaidAtByRecurring,
  updateRecurringApi,
  createRecurringApi,
  getRecurringDueAlerts,
  resolvePaymentStartDate,
  filterRecurringList,
  filterRecurringByNature,
  filterRecurringByYearMonth,
  filterRecurringBySearch,
  countRecurringByNature,
  sortRecurringList,
  toggleRecurringSort,
  isRecurringPaidInMonth,
  buildFixedYearPlan,
  sumRecurringActiveInMonth,
  type RecurringFilter,
  type RecurringNatureFilter,
  type RecurringSortState,
} from "@/api/recurring";
import type { YearMonth } from "@/domain/recurring/projection";
import { useDimensions } from "@/hooks/useDimensions";
import { RecurringSummary } from "./components/RecurringSummary";
import { RecurringDueAlerts } from "./components/RecurringDueAlerts";
import { RecurringListFilters } from "./components/RecurringListFilters";
import type { Recurring, RecurringCreateRequest } from "@/types/recurring";
import { toast } from "@/hooks/use-toast";
import { PageShell } from "@/components/PageShell";
import { ModuleGuide, ModuleGuideButton } from "@/components/ModuleGuide";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getErrorMessage } from "@/lib/errors";
import { useSidebar } from "@/components/ui/sidebar";
import { ChevronLeft, ChevronRight, Repeat } from "lucide-react";

type RecurringTab = "registros" | "projecao";

const MONTH_LABELS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const;

function shiftYm(ym: YearMonth, delta: number): YearMonth {
  const idx = ym.year * 12 + (ym.month - 1) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

function defaultRecurringCreateRequest(): RecurringCreateRequest {
  const payment_start_date = new Date().toISOString().split("T")[0];
  const plan = buildFixedYearPlan(payment_start_date);
  return {
    class_id: 0,
    value: 0,
    description: "",
    frequency: "Mensal",
    validity: plan.validity,
    due_day: 10,
    installment_count: plan.installment_count,
    payment_start_date,
    status: true,
  };
}

export default function Recurring() {
  const { isMobile } = useSidebar();
  const { dimensions } = useDimensions();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: RecurringTab =
    searchParams.get("tab") === "projecao" ? "projecao" : "registros";
  const [recurring, setRecurring] = useState<Recurring[]>([]);
  const now = new Date();
  const [listYm, setListYm] = useState<YearMonth>({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  });
  const [activeFilter, setActiveFilter] = useState<RecurringFilter>("all");
  const [natureFilter, setNatureFilter] =
    useState<RecurringNatureFilter>("all");
  const [search, setSearch] = useState("");
  const [showQuitadas, setShowQuitadas] = useState(false);
  const [sort, setSort] = useState<RecurringSortState>({
    key: "type",
    dir: "asc",
  });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmOpenSoft, setConfirmOpenSoft] = useState(false);
  const [confirmPaymentOpen, setConfirmPaymentOpen] = useState(false);
  const [selectedRecurring, setSelectedRecurring] = useState<Recurring | null>(null);
  const [open, setOpen] = useState(false);

  const [newRecurring, setNewRecurring] = useState<RecurringCreateRequest>(
    defaultRecurringCreateRequest
  );

  const [isEditing, setIsEditing] = useState(false);
  const [selectedParcel, setSelectedParcel] = useState<{
    transactionId: string;
    installmentNumber: number;
  } | null>(null);
  const [lastPaidAtById, setLastPaidAtById] = useState<Record<string, string>>(
    {}
  );

  const reloadRecurring = async () => {
    try {
      const [data, paidMap] = await Promise.all([
        fetchRecurringTransactions(null, null, { includeInactive: true }),
        fetchLastPaidAtByRecurring(),
      ]);
      const withInstallments = data.map((rec) => ({
        ...rec,
        installments: calculateInstallments(
          resolvePaymentStartDate(rec),
          rec.due_day,
          rec.installment_count,
          rec.validity,
          rec.frequency
        ),
      }));

      setRecurring(withInstallments);
      setLastPaidAtById(paidMap);
    } catch (err) {
      console.error("Erro ao buscar recorrências:", err);
      toast({
        variant: "destructive",
        title: "Erro ao carregar recorrências",
        description: getErrorMessage(err, "Não foi possível atualizar a recorrência."),
      });
    }
  };

  /** Atualiza paid_parcels localmente (feedback imediato ao marcar/desfazer pago). */
  function patchPaidParcels(recurringId: string, paidParcels: number[]) {
    setRecurring((prev) =>
      prev.map((rec) =>
        rec.id === recurringId ? { ...rec, paid_parcels: paidParcels } : rec
      )
    );
  }

  useEffect(() => {
    reloadRecurring();
  }, []);

  useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    setIsEditing(false);
    setSelectedRecurring(null);
    setNewRecurring(defaultRecurringCreateRequest());
    setOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete("new");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const activeRecurring = useMemo(
    () => recurring.filter((rec) => rec.status !== false),
    [recurring]
  );
  const inactiveRecurring = useMemo(
    () => recurring.filter((rec) => rec.status === false),
    [recurring]
  );

  const monthBase = useMemo(
    () => filterRecurringByYearMonth(activeRecurring, listYm.year, listYm.month),
    [activeRecurring, listYm.year, listYm.month]
  );

  const monthTotals = useMemo(
    () => sumRecurringActiveInMonth(activeRecurring, listYm.year, listYm.month),
    [activeRecurring, listYm.year, listYm.month]
  );

  const dueAlerts = useMemo(
    () => getRecurringDueAlerts(monthBase),
    [monthBase]
  );

  const searchedBase = useMemo(
    () => filterRecurringBySearch(monthBase, search),
    [monthBase, search]
  );

  const searchedArchived = useMemo(
    () => filterRecurringBySearch(inactiveRecurring, search),
    [inactiveRecurring, search]
  );

  const natureBase = useMemo(
    () => filterRecurringByNature(searchedBase, natureFilter),
    [searchedBase, natureFilter]
  );

  const natureArchived = useMemo(
    () => filterRecurringByNature(searchedArchived, natureFilter),
    [searchedArchived, natureFilter]
  );

  const natureCounts = useMemo(
    () =>
      countRecurringByNature(showQuitadas ? searchedArchived : searchedBase),
    [showQuitadas, searchedArchived, searchedBase]
  );

  const filterCounts = useMemo(() => {
    const overdueIds = new Set(
      dueAlerts.filter((a) => a.status === "overdue").map((a) => a.recurring.id)
    );
    const upcomingIds = new Set(
      dueAlerts.filter((a) => a.status === "upcoming").map((a) => a.recurring.id)
    );
    const paidInMonth = natureBase.filter((rec) =>
      isRecurringPaidInMonth(rec, listYm.year, listYm.month)
    );

    return {
      all: natureBase.length,
      open: natureBase.length - paidInMonth.length,
      paid: paidInMonth.length,
      upcoming: natureBase.filter((rec) => upcomingIds.has(rec.id)).length,
      overdue: natureBase.filter((rec) => overdueIds.has(rec.id)).length,
    } satisfies Record<RecurringFilter, number>;
  }, [natureBase, dueAlerts, listYm.year, listYm.month]);

  const filteredRecurring = useMemo(() => {
    if (showQuitadas) {
      return sortRecurringList(natureArchived, sort);
    }
    const byStatus = filterRecurringList(
      natureBase,
      activeFilter,
      dueAlerts,
      listYm.year,
      listYm.month
    );
    return sortRecurringList(byStatus, sort);
  }, [
    showQuitadas,
    natureArchived,
    natureBase,
    activeFilter,
    dueAlerts,
    sort,
    listYm.year,
    listYm.month,
  ]);

  const listMonthTitle = `${MONTH_LABELS[listYm.month - 1]} / ${listYm.year}`;
  const listMonthLabel = `${MONTH_LABELS[listYm.month - 1].slice(0, 3)}/${listYm.year}`;
  const currentYm: YearMonth = {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  };
  const isListCurrentMonth =
    listYm.year === currentYm.year && listYm.month === currentYm.month;

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
      setNewRecurring(defaultRecurringCreateRequest());
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
    setNewRecurring(defaultRecurringCreateRequest());
  }

  function setTab(next: RecurringTab) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next === "registros") params.delete("tab");
        else params.set("tab", "projecao");
        return params;
      },
      { replace: true }
    );
  }

  return (
    <PageShell
      title="Recorrências"
      description="Contas fixas (água, luz) e compras parceladas (10x, 12x), lista, projeção do mês e simular compra."
      actions={
        <>
          <ModuleGuideButton moduleId="finance" />
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
        </>
      }
    >
      <ModuleGuide moduleId="finance" />

      {recurring.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title="Nenhuma recorrência cadastrada"
          description="Cadastre contas fixas (água, luz) ou compras parceladas (12x), o app avisa vencimentos e monta a projeção do mês."
          action={
            <Button
              onClick={() => {
                setIsEditing(false);
                setSelectedRecurring(null);
                setNewRecurring(defaultRecurringCreateRequest());
                setOpen(true);
              }}
            >
              Nova recorrência
            </Button>
          }
        />
      ) : (
        <Tabs
          value={tab}
          onValueChange={(value) =>
            setTab(value === "projecao" ? "projecao" : "registros")
          }
          className="w-full"
        >
          <TabsList>
            <TabsTrigger value="registros">Registros</TabsTrigger>
            <TabsTrigger value="projecao">Projeção</TabsTrigger>
          </TabsList>

          <TabsContent value="registros" className="mt-4 space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Mês anterior"
                onClick={() => setListYm((prev) => shiftYm(prev, -1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <p className="min-w-[10rem] text-center text-sm font-semibold sm:text-base">
                {listMonthTitle}
              </p>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Próximo mês"
                onClick={() => setListYm((prev) => shiftYm(prev, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              {!isListCurrentMonth ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setListYm(currentYm)}
                >
                  Hoje
                </Button>
              ) : null}
            </div>

            <RecurringSummary
              totalFixesReceivable={monthTotals.receive}
              totalFixesPay={monthTotals.pay}
              periodLabel={listMonthLabel}
            />

            <RecurringDueAlerts alerts={showQuitadas ? [] : dueAlerts} />

            <section className="space-y-3">
              <RecurringListFilters
                search={search}
                onSearchChange={setSearch}
                natureFilter={natureFilter}
                onNatureChange={setNatureFilter}
                natureCounts={natureCounts}
                statusFilter={activeFilter}
                onStatusChange={setActiveFilter}
                statusCounts={filterCounts}
                showQuitadas={showQuitadas}
                onShowQuitadasChange={setShowQuitadas}
                quitadasCount={inactiveRecurring.length}
              />

              <div className="w-full min-w-0 overflow-x-auto rounded-xl border border-border/60 bg-card/30">
                <RecurringTable
                  recurring={filteredRecurring}
                  emptyTitle={
                    showQuitadas
                      ? "Nenhuma recorrência quitada"
                      : "Nenhuma recorrência neste filtro"
                  }
                  emptyDescription={
                    showQuitadas
                      ? "Contas encerradas com o check verde aparecem só aqui. Desmarque o filtro para voltar ao mês."
                      : "Ajuste a busca ou o filtro, ou cadastre uma recorrência para acompanhar o mês."
                  }
                  lastPaidAtById={lastPaidAtById}
                  isMobile={isMobile}
                  sort={sort}
                  onSortChange={(key) =>
                    setSort((prev) => toggleRecurringSort(prev, key))
                  }
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
                  onPaidParcelsChange={patchPaidParcels}
                  handleEditRecurring={handleEdit}
                />
              </div>
            </section>
          </TabsContent>

          <TabsContent value="projecao" className="mt-4">
            <RecurringProjection
              recurring={activeRecurring}
              onChanged={reloadRecurring}
              onPaidParcelsChange={patchPaidParcels}
            />
          </TabsContent>
        </Tabs>
      )}
    </PageShell>
  );
}
