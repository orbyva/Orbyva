import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";

import {
  fetchMonthLedger,
  fetchRecurringForDashboard,
  fetchValueByNatureForMonth,
  fetchValueByNatureYearMonth,
  fetchValueByTypeForMonth,
} from "@/api/finance/dashboard";
import {
  DonutChart,
  type DonutSlice,
} from "@/components/charts/DonutChart";
import { ChipBar } from "@/components/ChipBar";
import { NatureLineChart } from "@/components/charts/NatureLineChart";
import { MonthLedger } from "@/components/MonthLedger";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner, Card } from "@/components/ui";
import { Spacing } from "@/constants/theme";
import {
  buildMomTrends,
  previousYearMonth,
} from "@/domain/finance/insights";
import {
  calculateCommittedThisMonth,
  calculateProjectedMonthBalance,
  getRecurringDueAlerts,
} from "@/domain/recurring/alerts";
import { sharedValueSize } from "@/domain/ui/fitText";
import { useAppShell } from "@/hooks/use-app-shell";
import { useTheme } from "@/hooks/use-theme";
import { formatBRL } from "@/lib/currency";
import { getErrorMessage } from "@/lib/errors";
import type {
  LedgerTransaction,
  ValueByNatureYearMonth,
  ValueByTypeMonth,
} from "@/types/finance";
import type { Recurring, RecurringDueAlert } from "@/types/recurring";

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
      color: row.type_color || null,
    }));
}

export default function FinanceDashboardScreen() {
  const theme = useTheme();
  const { width: screenW } = useWindowDimensions();
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
  const [recurring, setRecurring] = useState<Recurring[]>([]);
  const [byType, setByType] = useState<ValueByTypeMonth[]>([]);
  const [series, setSeries] = useState<ValueByNatureYearMonth[]>([]);
  const [alerts, setAlerts] = useState<RecurringDueAlert[]>([]);
  const [ledger, setLedger] = useState<LedgerTransaction[]>([]);
  const hasLoaded = useRef(false);

  const load = useCallback(async () => {
    setError(null);
    const prev = previousYearMonth(YEAR, MONTH);
    const [current, previous, types, recs, history, monthTxs] =
      await Promise.all([
        fetchValueByNatureForMonth(YEAR, MONTH),
        fetchValueByNatureForMonth(prev.year, prev.month),
        fetchValueByTypeForMonth(YEAR, MONTH),
        fetchRecurringForDashboard(),
        fetchValueByNatureYearMonth(),
        fetchMonthLedger(YEAR, MONTH),
      ]);
    setReceita(current?.receita_total ?? 0);
    setDespesa(current?.despesa_total ?? 0);
    setPrevReceita(previous ? previous.receita_total : null);
    setPrevDespesa(previous ? previous.despesa_total : null);
    setByType(types);
    setRecurring(recs);
    setAlerts(getRecurringDueAlerts(recs));
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
  const committed = useMemo(
    () =>
      calculateCommittedThisMonth(recurring, new Date(YEAR, MONTH - 1, 15)),
    [recurring]
  );
  const projected = useMemo(
    () =>
      calculateProjectedMonthBalance({ receita, despesa }, committed),
    [receita, despesa, committed]
  );
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

  const kpiValueSize = sharedValueSize(
    [receita, despesa, saldo, projected.projectedBalance].map(formatBRL),
    (screenW - Spacing.four * 2 - Spacing.two) / 2 - KPI_PADDING * 2
  );

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
        <Banner message={error} />

        <View style={styles.kpiRow}>
          <Kpi
            label="Receita"
            valueSize={kpiValueSize}
            value={formatBRL(receita)}
            hint={mom.receita}
            accent={theme.success}
          />
          <Kpi
            label="Despesa"
            valueSize={kpiValueSize}
            value={formatBRL(despesa)}
            hint={mom.despesa}
            accent={theme.destructive}
          />
        </View>
        <View style={styles.kpiRow}>
          <Kpi
            label="Saldo"
            valueSize={kpiValueSize}
            value={formatBRL(saldo)}
            hint={mom.saldo}
            accent={saldo < 0 ? theme.destructive : theme.primary}
          />
          <Kpi
            label="Saldo previsto"
            valueSize={kpiValueSize}
            value={formatBRL(projected.projectedBalance)}
            hint={`A pagar: ${formatBRL(committed.pay)} · A receber: ${formatBRL(committed.receive)}`}
            accent={
              projected.projectedBalance < 0 ? theme.destructive : theme.success
            }
          />
        </View>

        {alerts.length > 0 ? (
          <View style={styles.block}>
            <ThemedText type="smallBold">Contas</ThemedText>
            {alerts.map((alert) => (
              <ThemedText
                key={`${alert.recurring.id}-${alert.installmentNumber}`}
                themeColor="mutedForeground"
              >
                {alert.status === "overdue" ? "Atrasada · " : "Vence · "}
                {alert.message}
              </ThemedText>
            ))}
          </View>
        ) : null}

        <View style={styles.block}>
          <ThemedText type="smallBold">Por categoria</ThemedText>
          <ChipBar
            options={[
              { id: "despesa", label: "Despesas" },
              { id: "receita", label: "Receitas" },
            ]}
            value={donutTab}
            onChange={selectDonutTab}
          />
          <ThemedText type="small" themeColor="mutedForeground">
            Toque uma fatia para ver o valor e filtrar o extrato.
          </ThemedText>
          <DonutChart
            slices={activeSlices}
            holeLabel={formatBRL(
              donutTab === "despesa" ? despesa : receita
            )}
            background={theme.background}
            selectedLabel={selectedType}
            selectedRowBg={theme.border}
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
            headerBg={theme.border}
            rowBg={theme.muted}
          />
        </View>

        <View style={styles.block}>
          <ThemedText type="smallBold">Receita e despesa no tempo</ThemedText>
          <ThemedText type="small" themeColor="mutedForeground">
            Últimos 12 meses
          </ThemedText>
          <NatureLineChart series={series} textColor={theme.foreground} />
        </View>
      </ScrollView>
    </ThemedView>
  );
}

function Kpi({
  label,
  value,
  hint,
  accent,
  valueSize,
}: {
  label: string;
  value: string;
  hint?: string | null;
  accent: string;
  valueSize: { fontSize: number; lineHeight: number };
}) {
  return (
    <Card style={styles.kpi}>
      <View style={[styles.kpiBar, { backgroundColor: accent }]} />
      <ThemedText type="micro" themeColor="mutedForeground" style={styles.kpiLabel}>
        {label}
      </ThemedText>
      <ThemedText type="value" numberOfLines={1} style={[valueSize, { color: accent }]}>
        {value}
      </ThemedText>
      {hint ? (
        <ThemedText type="caption" themeColor="mutedForeground">
          {hint}
        </ThemedText>
      ) : null}
    </Card>
  );
}

const KPI_PADDING = Spacing.three;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: { padding: Spacing.four, gap: Spacing.three, paddingBottom: 48 },
  kpiRow: { flexDirection: "row", gap: Spacing.two },
  kpi: { flex: 1, gap: 4, padding: KPI_PADDING, overflow: "hidden" },
  kpiBar: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },
  kpiLabel: { textTransform: "uppercase", letterSpacing: 0.4 },
  block: { gap: Spacing.two },
});
