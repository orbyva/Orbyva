import { useFocusEffect, useNavigation } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  fetchMonthlyBudgetSummary,
} from "@/api/finance/dashboard";
import { shiftYearMonth } from "@/api/finance/transactions";
import { BudgetList } from "@/components/BudgetList";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import {
  getBudgetRealizedValue,
  groupBudgetsByType,
} from "@/domain/budget/listView";
import { useAppShell } from "@/hooks/use-app-shell";
import { useTheme } from "@/hooks/use-theme";
import { formatBRL } from "@/lib/currency";
import { getErrorMessage } from "@/lib/errors";
import type { MonthlyBudgetSummary } from "@/types/finance";

const now = new Date();

function monthTitle(year: number, month: number): string {
  const label = new Date(year, month - 1).toLocaleString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export default function BudgetScreen() {
  const theme = useTheme();
  const navigation = useNavigation();
  const { bottomInset } = useAppShell();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [rows, setRows] = useState<MonthlyBudgetSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: "Orçamento" });
  }, [navigation]);

  const load = useCallback(async () => {
    setError(null);
    const data = await fetchMonthlyBudgetSummary(budgetMonthIso(year, month));
    setRows(data);
  }, [year, month]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      void load()
        .catch((err) => {
          if (!cancelled) {
            setError(
              getErrorMessage(err, "Não foi possível carregar o orçamento.")
            );
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [load])
  );

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

  const groups = useMemo(() => groupBudgetsByType(rows), [rows]);
  const expenseParents = useMemo(
    () =>
      groups
        .map((group) => group.parent)
        .filter((item) => /despesa/i.test(item.nature_name || "")),
    [groups]
  );
  const incomeParents = useMemo(
    () =>
      groups
        .map((group) => group.parent)
        .filter((item) => /receita/i.test(item.nature_name || "")),
    [groups]
  );
  const overflows = useMemo(
    () =>
      rows.filter(
        (item) =>
          /despesa/i.test(item.nature_name || "") &&
          Number(item.remaining_value || 0) < 0
      ),
    [rows]
  );

  const plannedExpense = expenseParents.reduce(
    (s, b) => s + Number(b.planned_value || 0),
    0
  );
  const spentExpense = expenseParents.reduce(
    (s, b) => s + getBudgetRealizedValue(b),
    0
  );
  const plannedIncome = incomeParents.reduce(
    (s, b) => s + Number(b.planned_value || 0),
    0
  );
  const spentIncome = incomeParents.reduce(
    (s, b) => s + getBudgetRealizedValue(b),
    0
  );

  return (
    <ThemedView style={styles.flex}>
      <View style={styles.head}>
        <View style={styles.monthRow}>
          <Pressable
            onPress={() => {
              const next = shiftYearMonth(year, month, -1);
              setYear(next.year);
              setMonth(next.month);
            }}
            style={[
              styles.monthBtn,
              { backgroundColor: theme.backgroundElement },
            ]}
          >
            <ThemedText type="smallBold">‹</ThemedText>
          </Pressable>
          <ThemedText type="smallBold" style={styles.monthTitle}>
            {monthTitle(year, month)}
          </ThemedText>
          <Pressable
            onPress={() => {
              const next = shiftYearMonth(year, month, 1);
              setYear(next.year);
              setMonth(next.month);
            }}
            style={[
              styles.monthBtn,
              { backgroundColor: theme.backgroundElement },
            ]}
          >
            <ThemedText type="smallBold">›</ThemedText>
          </Pressable>
        </View>

        <View style={styles.kpis}>
          <View
            style={[styles.kpi, { backgroundColor: theme.backgroundElement }]}
          >
            <ThemedText type="small" themeColor="textSecondary">
              Gasto
            </ThemedText>
            <ThemedText type="smallBold">{formatBRL(spentExpense)}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Teto {formatBRL(plannedExpense)}
            </ThemedText>
          </View>
          <View
            style={[styles.kpi, { backgroundColor: theme.backgroundElement }]}
          >
            <ThemedText type="small" themeColor="textSecondary">
              Receita
            </ThemedText>
            <ThemedText type="smallBold">{formatBRL(spentIncome)}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Orçado {formatBRL(plannedIncome)}
            </ThemedText>
          </View>
        </View>

        {overflows.length > 0 ? (
          <View style={styles.alert}>
            <ThemedText type="smallBold" style={styles.alertTitle}>
              Estouro de orçamento
            </ThemedText>
            {overflows.map((row) => (
              <ThemedText
                key={`${row.id}-${row.class_id ?? "p"}`}
                type="small"
                style={styles.alertText}
              >
                {row.type_name}
                {row.class_name ? ` · ${row.class_name}` : ""}: gasto{" "}
                {formatBRL(getBudgetRealizedValue(row))} /{" "}
                {formatBRL(row.planned_value)}
              </ThemedText>
            ))}
          </View>
        ) : null}

        {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}
      </View>

      {loading && rows.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.list,
            { paddingBottom: bottomInset + 24 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void onRefresh()}
            />
          }
        >
          <BudgetList groups={groups} />
        </ScrollView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  head: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    gap: Spacing.two,
  },
  monthRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  monthBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  monthTitle: { flex: 1, textAlign: "center" },
  kpis: { flexDirection: "row", gap: 8 },
  kpi: { flex: 1, borderRadius: 12, padding: 12, gap: 2 },
  alert: {
    borderRadius: 12,
    padding: 12,
    gap: 4,
    backgroundColor: "#E11D4814",
  },
  alertTitle: { color: "#E11D48" },
  alertText: { color: "#E11D48" },
  list: { padding: Spacing.four },
  error: { color: "#E11D48" },
});
