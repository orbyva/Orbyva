import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import {
  budgetMonthIso,
  fetchMonthLedger,
  fetchMonthlyBudgetSummary,
  fetchRecurringForDashboard,
  fetchValueByNatureForMonth,
  fetchValueByNatureYearMonth,
  fetchValueByTypeForMonth,
} from "@/api/finance/dashboard";
import {
  CHART_FALLBACK,
  DonutChart,
  type DonutSlice,
} from "@/components/charts/DonutChart";
import { NatureLineChart } from "@/components/charts/NatureLineChart";
import { MonthLedger } from "@/components/MonthLedger";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import {
  buildMomTrends,
  previousYearMonth,
} from "@/domain/finance/insights";
import { getRecurringDueAlerts } from "@/domain/recurring/alerts";
import { useAppShell } from "@/hooks/use-app-shell";
import { useTheme } from "@/hooks/use-theme";
import { formatBRL } from "@/lib/currency";
import { getErrorMessage } from "@/lib/errors";
import {
  sumExpenseBudgetCeiling,
  type LedgerTransaction,
  type ValueByNatureYearMonth,
  type ValueByTypeMonth,
} from "@/types/finance";
import type { RecurringDueAlert } from "@/types/recurring";

const now = new Date();
const YEAR = now.getFullYear();
const MONTH = now.getMonth() + 1;

function slicesForNature(
  rows: ValueByTypeMonth[],
  nature: "Receita" | "Despesa"
): DonutSlice[] {
  return rows
    .filter((row) => row.nature_name === nature && row.total_value > 0)
    .sort((a, b) => b.total_value - a.total_value)
    .map((row) => ({
      label: row.type_name,
      value: row.total_value,
      color: row.type_color || CHART_FALLBACK,
    }));
}

export default function FinanceDashboardScreen() {
  const theme = useTheme();
  const { bottomInset } = useAppShell();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [donutTab, setDonutTab] = useState<"despesa" | "receita">("despesa");
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [receita, setReceita] = useState(0);
  const [despesa, setDespesa] = useState(0);
  const [prevReceita, setPrevReceita] = useState<number | null>(null);
  const [prevDespesa, setPrevDespesa] = useState<number | null>(null);
  const [ceiling, setCeiling] = useState<number | null>(null);
  const [byType, setByType] = useState<ValueByTypeMonth[]>([]);
  const [series, setSeries] = useState<ValueByNatureYearMonth[]>([]);
  const [alerts, setAlerts] = useState<RecurringDueAlert[]>([]);
  const [ledger, setLedger] = useState<LedgerTransaction[]>([]);
  const hasLoaded = useRef(false);

  const load = useCallback(async () => {
    setError(null);
    const prev = previousYearMonth(YEAR, MONTH);
    const [current, previous, types, budgets, recurring, history, monthTxs] =
      await Promise.all([
        fetchValueByNatureForMonth(YEAR, MONTH),
        fetchValueByNatureForMonth(prev.year, prev.month),
        fetchValueByTypeForMonth(YEAR, MONTH),
        fetchMonthlyBudgetSummary(budgetMonthIso(YEAR, MONTH)),
        fetchRecurringForDashboard(),
        fetchValueByNatureYearMonth(),
        fetchMonthLedger(YEAR, MONTH),
      ]);
    setReceita(current?.receita_total ?? 0);
    setDespesa(current?.despesa_total ?? 0);
    setPrevReceita(previous ? previous.receita_total : null);
    setPrevDespesa(previous ? previous.despesa_total : null);
    setByType(types);
    setCeiling(sumExpenseBudgetCeiling(budgets));
    setAlerts(getRecurringDueAlerts(recurring));
    setSeries(history);
    setLedger(monthTxs);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (!hasLoaded.current) setLoading(true);
      void load()
        .catch((err) => {
          if (!cancelled) {
            setError(
              getErrorMessage(err, "Não foi possível carregar Finanças.")
            );
          }
        })
        .finally(() => {
          if (!cancelled) {
            hasLoaded.current = true;
            setLoading(false);
          }
        });
      return () => {
        cancelled = true;
      };
    }, [load])
  );

  const saldo = receita - despesa;
  const mom = useMemo(
    () =>
      buildMomTrends(
        { receita, despesa },
        prevReceita == null && prevDespesa == null
          ? null
          : { receita: prevReceita ?? 0, despesa: prevDespesa ?? 0 },
        previousYearMonth(YEAR, MONTH).month
      ),
    [receita, despesa, prevReceita, prevDespesa]
  );

  const overBudget = ceiling != null && ceiling > 0 && despesa > ceiling;
  const despesaSlices = useMemo(
    () => slicesForNature(byType, "Despesa"),
    [byType]
  );
  const receitaSlices = useMemo(
    () => slicesForNature(byType, "Receita"),
    [byType]
  );
  const activeSlices = donutTab === "despesa" ? despesaSlices : receitaSlices;
  const natureName = donutTab === "despesa" ? "Despesa" : "Receita";
  const monthLabel = new Date(YEAR, MONTH - 1).toLocaleString("pt-BR", {
    month: "long",
  });
  const extractRows = useMemo(
    () =>
      ledger.filter((tx) => {
        const matchesNature = tx.class?.type?.nature?.name === natureName;
        const matchesType =
          !selectedType || tx.class?.type?.name === selectedType;
        return matchesNature && matchesType;
      }),
    [ledger, natureName, selectedType]
  );

  function selectDonutTab(tab: "despesa" | "receita") {
    setDonutTab(tab);
    const slices = tab === "despesa" ? despesaSlices : receitaSlices;
    setSelectedType((cur) =>
      cur && slices.some((slice) => slice.label === cur) ? cur : null
    );
  }

  async function onRefresh() {
    setRefreshing(true);
    try {
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Não foi possível atualizar."));
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator color={theme.primary} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.flex}>
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: bottomInset + 24 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
          />
        }
      >
        {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}

        <View style={styles.actions}>
          <Pressable
            onPress={() => router.push("/finance/transactions")}
            style={[
              styles.actionBtn,
              { backgroundColor: theme.backgroundElement },
            ]}
          >
            <ThemedText type="smallBold">Transações</ThemedText>
          </Pressable>
          <Pressable
            onPress={() => router.push("/finance/recurring")}
            style={[
              styles.actionBtn,
              { backgroundColor: theme.backgroundElement },
            ]}
          >
            <ThemedText type="smallBold">Recorrências</ThemedText>
          </Pressable>
        </View>
        <View style={styles.actions}>
          <Pressable
            onPress={() => router.push("/finance/budget")}
            style={[
              styles.actionBtn,
              { backgroundColor: theme.backgroundElement },
            ]}
          >
            <ThemedText type="smallBold">Orçamento</ThemedText>
          </Pressable>
          <Pressable
            onPress={() => router.push("/finance/categories")}
            style={[
              styles.actionBtn,
              { backgroundColor: theme.backgroundElement },
            ]}
          >
            <ThemedText type="smallBold">Categorias</ThemedText>
          </Pressable>
        </View>

        <View style={styles.kpiRow}>
          <Kpi
            label="Saldo"
            value={formatBRL(saldo)}
            hint={mom.saldo}
            theme={theme}
          />
          <Kpi
            label="Despesa"
            value={formatBRL(despesa)}
            hint={mom.despesa}
            theme={theme}
          />
        </View>
        <Kpi
          label="Teto do mês"
          value={ceiling != null ? formatBRL(ceiling) : "Sem orçamento"}
          hint={
            overBudget
              ? "Estourou o teto"
              : ceiling
                ? `${formatBRL(Math.max(0, ceiling - despesa))} restantes`
                : undefined
          }
          theme={theme}
        />

        {alerts.length > 0 ? (
          <View style={styles.block}>
            <ThemedText type="smallBold">Contas</ThemedText>
            {alerts.map((alert) => (
              <ThemedText
                key={`${alert.recurring.id}-${alert.installmentNumber}`}
                themeColor="textSecondary"
              >
                {alert.status === "overdue" ? "Atrasada · " : "Vence · "}
                {alert.message}
              </ThemedText>
            ))}
          </View>
        ) : null}

        <View style={styles.block}>
          <ThemedText type="smallBold">Por categoria</ThemedText>
          <View style={styles.tabs}>
            <Pressable
              onPress={() => selectDonutTab("despesa")}
              style={[
                styles.tab,
                { backgroundColor: theme.backgroundElement },
                donutTab === "despesa" && {
                  backgroundColor: theme.backgroundSelected,
                },
              ]}
            >
              <ThemedText type="smallBold">Despesas</ThemedText>
            </Pressable>
            <Pressable
              onPress={() => selectDonutTab("receita")}
              style={[
                styles.tab,
                { backgroundColor: theme.backgroundElement },
                donutTab === "receita" && {
                  backgroundColor: theme.backgroundSelected,
                },
              ]}
            >
              <ThemedText type="smallBold">Receitas</ThemedText>
            </Pressable>
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            Toque uma fatia para ver o valor e filtrar o extrato.
          </ThemedText>
          <DonutChart
            slices={activeSlices}
            holeLabel={formatBRL(
              donutTab === "despesa" ? despesa : receita
            )}
            background={theme.background}
            selectedLabel={selectedType}
            selectedRowBg={theme.backgroundSelected}
            onSlicePress={(slice) => {
              setSelectedType((cur) =>
                cur === slice.label ? null : slice.label
              );
            }}
          />
        </View>

        <View style={styles.block}>
          <MonthLedger
            rows={extractRows}
            monthLabel={monthLabel}
            nature={natureName}
            selectedType={selectedType}
            onClearFilter={() => setSelectedType(null)}
            onSeeAll={() => router.push("/finance/transactions")}
            onPressRow={(tx) =>
              router.push({
                pathname: "/finance/form",
                params: { id: String(tx.id) },
              })
            }
            headerBg={theme.backgroundSelected}
            rowBg={theme.backgroundElement}
          />
        </View>

        <View style={styles.block}>
          <ThemedText type="smallBold">Receita e despesa no tempo</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Últimos 12 meses
          </ThemedText>
          <NatureLineChart series={series} textColor={theme.text} />
        </View>
      </ScrollView>
    </ThemedView>
  );
}

function Kpi({
  label,
  value,
  hint,
  theme,
}: {
  label: string;
  value: string;
  hint?: string | null;
  theme: { backgroundElement: string };
}) {
  return (
    <View style={[styles.kpi, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smallBold">{value}</ThemedText>
      {hint ? (
        <ThemedText type="small" themeColor="textSecondary">
          {hint}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: { padding: Spacing.four, gap: Spacing.three, paddingBottom: 48 },
  actions: { flexDirection: "row", gap: Spacing.two },
  actionBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 999,
  },
  kpiRow: { flexDirection: "row", gap: Spacing.two },
  kpi: { flex: 1, borderRadius: 16, padding: Spacing.three, gap: 4 },
  block: { gap: Spacing.two },
  tabs: { flexDirection: "row", gap: Spacing.two },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 999,
  },
  error: { color: "#E11D48" },
});
