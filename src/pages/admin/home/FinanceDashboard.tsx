  import { useCallback, useEffect, useMemo, useState } from "react";
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
  } from "@/components/ui/card";
  import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
  import { Overview } from "./components/overview";
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from "@/components/ui/select";
  import { TransactionsTable } from "./components/TransactionsTable";
  import { Transaction, ValueByNatureYearMonth } from "@/types/finance";
  import { KpiCardProps, KpiCardsGrid } from "./components/KpiCard";
  import { MemoDonutChart, DonutChartData } from "./components/PieChart";
  import {
    fetchTransactions,
    fetchValueByNatureForMonth,
    fetchValueByNatureYearMonth,
  } from "@/api/finance";
  import { Button } from "@/components/ui/button";
  import { Link } from "react-router-dom";
  import { Share2, Wallet } from "lucide-react";
  import { PageShell } from "@/components/PageShell";
  import { EmptyState } from "@/components/EmptyState";
  import { ShareImageDialog } from "@/components/ShareImageDialog";
  import {
    generateMonthSpendShareImage,
    shareMonthSpendNative,
  } from "@/lib/monthSpendShare";
  import {
    calculateInstallments,
    calculateCommittedThisMonth,
    fetchRecurringTransactions,
    getRecurringDueAlerts,
    resolvePaymentStartDate,
  } from "@/api/recurring";
  import { RecurringDueAlerts } from "@/pages/admin/finance/components/RecurringDueAlerts";
  import { Recurring } from "@/types/recurring";
  import { formatBRL } from "@/lib/currency";
  import { chartColors } from "@/lib/design-tokens";

  const today = new Date();
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();

  function buildDonutChartData(
    transactions: Transaction[],
    nature: string
  ): DonutChartData[] {
    const groupedData: Record<string, DonutChartData> = {};

    transactions.forEach((transaction) => {
      const natureName = transaction.class?.type?.nature?.name;
      const typeName = transaction.class?.type?.name;
      const typeColor = transaction.class?.type?.hex_color;
      const value = transaction.value;

      if (!natureName || natureName !== nature) return;
      if (!typeName) return;

      if (!groupedData[typeName]) {
        groupedData[typeName] = {
          type: typeName,
          total_value: 0,
          fill: typeColor || chartColors.fallback,
        };
      }

      groupedData[typeName].total_value += value;
    });

    return Object.values(groupedData);
  }

  export default function FinanceDashboard() {
    const [selectedMonth, setSelectedMonth] = useState<number>(currentMonth);
    const [selectedYear, setSelectedYear] = useState<number>(currentYear);
    const [tableTab, setTableTab] = useState<"receita" | "despesa">("despesa");

    const [receitaTotal, setReceitaTotal] = useState<number>(0);
    const [despesaTotal, setDespesaTotal] = useState<number>(0);
    const [cardsLoading, setCardsLoading] = useState(true);
    const [donutChartDataReceita, setDonutChartDataReceita] = useState<
      DonutChartData[]
    >([]);
    const [donutChartDataDespesa, setDonutChartDataDespesa] = useState<
      DonutChartData[]
    >([]);

    const [datasets, setDatasets] = useState<ValueByNatureYearMonth[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);

    const [selectedType, setSelectedType] = useState<string | null>(null);
    const [recurring, setRecurring] = useState<Recurring[]>([]);
    const [shareOpen, setShareOpen] = useState(false);

    const dueAlerts = useMemo(
      () => getRecurringDueAlerts(recurring),
      [recurring]
    );

    const committed = useMemo(
      () => calculateCommittedThisMonth(recurring),
      [recurring]
    );

    const kpiCardsData: KpiCardProps[] = useMemo(
      () => [
        {
          title: "Receita Total",
          value: receitaTotal,
          variant: "income",
          description: null,
          isLoading: cardsLoading,
          trendText: null,
          formatValue: (value: number) => formatBRL(value),
        },
        {
          title: "Despesa Total",
          value: despesaTotal,
          variant: "expense",
          description: null,
          isLoading: cardsLoading,
          trendText: null,
          formatValue: (value: number) => formatBRL(value),
        },
        {
          title: "Saldo",
          value: receitaTotal - despesaTotal,
          variant: "primary",
          description: null,
          isLoading: cardsLoading,
          trendText: null,
          formatValue: (value: number) => {
            const percent = receitaTotal ? (value / receitaTotal) * 100 : 0;
            return `${formatBRL(value > 0 ? value : 0)} (${percent.toFixed(1)}%)`;
          },
        },
        {
          title: "Comprometido no mês",
          value: committed.pay,
          variant: "muted",
          description: `A receber: ${formatBRL(committed.receive)}`,
          isLoading: cardsLoading,
          trendText: null,
          formatValue: (value: number) => formatBRL(value),
        },
      ],
      [receitaTotal, despesaTotal, cardsLoading, committed.pay, committed.receive]
    );

    const fetchChartData = useCallback(async (): Promise<ValueByNatureYearMonth[]> => {
      try {
        return await fetchValueByNatureYearMonth();
      } catch (error) {
        console.error("Erro ao buscar dados do gráfico:", error);
        return [];
      }
    }, []);

    const fetchCardsData = useCallback(async (): Promise<ValueByNatureYearMonth | null> => {
      try {
        return await fetchValueByNatureForMonth(selectedYear, selectedMonth);
      } catch (error) {
        console.error("Erro ao buscar dados dos cards:", error);
        return null;
      }
    }, [selectedMonth, selectedYear]);

    const fetchTransactionsData = useCallback(async () => {
      try {
        const lastDayOfMonth = new Date(selectedYear, selectedMonth, 0).getDate();

        const startDate = `${selectedYear}-${String(selectedMonth).padStart(
          2,
          "0"
        )}-01T00:00:00.000Z`;
        const endDate = `${selectedYear}-${String(selectedMonth).padStart(
          2,
          "0"
        )}-${lastDayOfMonth}T23:59:59.999Z`;

        const transactions = await fetchTransactions(1, 100, startDate, endDate);
        return transactions;
      } catch (error) {
        console.error("Error fetching transactions:", error);
        return [];
      }
    }, [selectedMonth, selectedYear]);

    useEffect(() => {
      async function getCardsData() {
        setCardsLoading(true);
        const data = await fetchCardsData();

        if (data) {
          setReceitaTotal(data.receita_total);
          setDespesaTotal(data.despesa_total);
        } else {
          setReceitaTotal(0);
          setDespesaTotal(0);
        }

        setCardsLoading(false);
      }

      async function getTransactions() {
        const data = await fetchTransactionsData();
        setTransactions(data);

        const receitaData = buildDonutChartData(data, "Receita");
        const despesaData = buildDonutChartData(data, "Despesa");

        setDonutChartDataReceita(receitaData);
        setDonutChartDataDespesa(despesaData);
      }

      getTransactions();
      getCardsData();
    }, [fetchCardsData, fetchTransactionsData]);

    useEffect(() => {
      async function loadRecurringDueAlerts() {
        try {
          const data = await fetchRecurringTransactions();
          setRecurring(
            data.map((rec) => ({
              ...rec,
              installments: calculateInstallments(
                resolvePaymentStartDate(rec),
                rec.due_day,
                rec.installment_count,
                rec.validity
              ),
            }))
          );
        } catch (error) {
          console.error("Erro ao buscar avisos de vencimento:", error);
        }
      }

      loadRecurringDueAlerts();
    }, []);

    useEffect(() => {
      async function getChartData() {
        const next = await fetchChartData();
        setDatasets(next);
      }

      void getChartData();
    }, [fetchChartData]);

    const receitaTransactions = useMemo(
      () =>
        transactions.filter((transaction) => {
          const isReceita =
            transaction.class?.type?.nature?.name === "Receita";
          const matchesType =
            !selectedType || transaction.class?.type?.name === selectedType;
          return isReceita && matchesType;
        }),
      [transactions, selectedType]
    );

    const despesaTransactions = useMemo(
      () =>
        transactions.filter((transaction) => {
          const isDespesa =
            transaction.class?.type?.nature?.name === "Despesa";
          const matchesType =
            !selectedType || transaction.class?.type?.name === selectedType;
          return isDespesa && matchesType;
        }),
      [transactions, selectedType]
    );

    return (
      <PageShell
        title="Finanças"
        description="Visão detalhada das receitas, despesas e saldo do período."
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[240px]">
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => setShareOpen(true)}
            >
              <Share2 className="h-4 w-4" />
              Compartilhar mês
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Select
                onValueChange={(value) => setSelectedMonth(Number(value))}
                value={String(selectedMonth)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Mês" />
                </SelectTrigger>

                <SelectContent>
                  {[...Array(12)].map((_, i) => {
                    const monthName = new Date(0, i).toLocaleString("pt-BR", {
                      month: "long",
                    });
                    const monthLabel =
                      monthName.charAt(0).toUpperCase() + monthName.slice(1);

                    return (
                      <SelectItem key={i + 1} value={String(i + 1)}>
                        {monthLabel}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>

              <Select
                onValueChange={(value) => setSelectedYear(Number(value))}
                value={String(selectedYear)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Ano" />
                </SelectTrigger>

                <SelectContent>
                  {[...Array(currentYear - 2025 + 1)].map((_, i) => {
                    const year = 2025 + i;

                    return (
                      <SelectItem key={year} value={String(year)}>
                        {year}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>
        }
      >
        <RecurringDueAlerts alerts={dueAlerts} showRecurringLink />

        <ShareImageDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          title="Compartilhar gasto do mês"
          generateImage={() =>
            generateMonthSpendShareImage({
              year: selectedYear,
              month: selectedMonth,
              receita: receitaTotal,
              despesa: despesaTotal,
            })
          }
          share={(blob) =>
            shareMonthSpendNative(
              {
                year: selectedYear,
                month: selectedMonth,
                receita: receitaTotal,
                despesa: despesaTotal,
              },
              blob
            )
          }
        />

        {!cardsLoading &&
        transactions.length === 0 &&
        receitaTotal === 0 &&
        despesaTotal === 0 ? (
          <EmptyState
            icon={Wallet}
            title="Ledger ainda vazio neste mês"
            description="Registre a primeira receita ou despesa para o dashboard acompanhar o life OS — o mesmo passo do onboarding."
            action={
              <Button asChild>
                <Link to="/finance/transactions?new=1">Nova transação</Link>
              </Button>
            }
          />
        ) : (
        <div className="space-y-6">
          <section className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
              <KpiCardsGrid data={kpiCardsData} />

              <Tabs defaultValue="despesa" className="rounded-xl border p-4">
                <TabsList>
                  <TabsTrigger value="receita">Receitas</TabsTrigger>
                  <TabsTrigger value="despesa">Despesas</TabsTrigger>
                </TabsList>

                <TabsContent value="receita">
                  <MemoDonutChart
                    data={donutChartDataReceita}
                    onSliceClick={(type) => {
                      setSelectedType((prev) => (prev === type ? null : type));
                      setTableTab("receita");
                    }}
                  />
                </TabsContent>

                <TabsContent value="despesa">
                  <MemoDonutChart
                    data={donutChartDataDespesa}
                    onSliceClick={(type) => {
                      setSelectedType((prev) => (prev === type ? null : type));
                      setTableTab("despesa");
                    }}
                  />
                </TabsContent>
              </Tabs>
            </section>

            <section className="grid gap-4 sm:grid-cols-1 lg:grid-cols-5">
              <Overview datasets={datasets} />

              <Tabs
                value={tableTab}
                onValueChange={(value) => setTableTab(value as "receita" | "despesa")}
                className="sm:col-span-1 lg:col-span-2"
              >

                <TabsList>
                  <TabsTrigger value="receita">Receitas</TabsTrigger>
                  <TabsTrigger value="despesa">Despesas</TabsTrigger>
                </TabsList>

                <TabsContent value="receita">
                  <Card>
                    <CardHeader>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <CardTitle>Transações Neste Mês</CardTitle>
                          <CardDescription>
                            Você fez {receitaTransactions.length} transações de Receita em{" "}
                            {new Date(selectedYear, selectedMonth - 1).toLocaleString("pt-BR", {
                              month: "long",
                            })}
                            .
                          </CardDescription>
                        </div>

                        {selectedType && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedType(null)}
                          >
                            {selectedType} ✕
                          </Button>
                        )}
                      </div>
                    </CardHeader>

                    <CardContent>
                      <TransactionsTable transactions={receitaTransactions} />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="despesa">
                  <Card>
                    <CardHeader>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <CardTitle>Transações Neste Mês</CardTitle>
                          <CardDescription>
                            Você fez {despesaTransactions.length} transações de Despesa em{" "}
                            {new Date(selectedYear, selectedMonth - 1).toLocaleString("pt-BR", {
                              month: "long",
                            })}
                            .
                          </CardDescription>
                        </div>

                        {selectedType && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedType(null)}
                          >
                            {selectedType} ✕
                          </Button>
                        )}
                      </div>
                    </CardHeader>

                    <CardContent>
                      <TransactionsTable transactions={despesaTransactions} />
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </section>
        </div>
        )}
      </PageShell>
    );
  }
