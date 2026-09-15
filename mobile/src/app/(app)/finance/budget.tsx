import { useFocusEffect, useNavigation, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import {
  createMonthlyBudgetApi,
  duplicateMonthlyBudgetApi,
  fetchMonthlyBudgetSuggestions,
  type DuplicateBudgetMode,
} from "@/api/finance/budget";
import {
  budgetMonthIso,
  fetchMonthlyBudgetSummary,
} from "@/api/finance/dashboard";
import { shiftYearMonth } from "@/api/finance/transactions";
import { BudgetList } from "@/components/BudgetList";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner } from "@/components/ui/Banner";
import { CollapsibleChrome } from "@/components/ui/CollapsibleChrome";
import { Spacing } from "@/constants/theme";
import {
  getBudgetRealizedValue,
  groupBudgetsByType,
} from "@/domain/budget/listView";
import { useAppShell } from "@/hooks/use-app-shell";
import { useTheme } from "@/hooks/use-theme";
import { hexAlpha, tintedSurface } from "@/lib/color";
import { formatBRL } from "@/lib/currency";
import { getErrorMessage } from "@/lib/errors";
import type {
  MonthlyBudgetSuggestion,
  MonthlyBudgetSummary,
} from "@/types/finance";

const now = new Date();

function monthTitle(year: number, month: number): string {
  const label = new Date(year, month - 1).toLocaleString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function nextMonths(fromYear: number, fromMonth: number, count = 6) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(fromYear, fromMonth - 1 + index + 1, 1);
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
    const label = date.toLocaleString("pt-BR", {
      month: "long",
      year: "numeric",
    });
    return {
      value,
      label: label.charAt(0).toUpperCase() + label.slice(1),
    };
  });
}

export default function BudgetScreen() {
  const theme = useTheme();
  const navigation = useNavigation();
  const router = useRouter();
  const { bottomInset } = useAppShell();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [rows, setRows] = useState<MonthlyBudgetSummary[]>([]);
  const [suggestions, setSuggestions] = useState<MonthlyBudgetSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const hasLoaded = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dupOpen, setDupOpen] = useState(false);
  const [dupMonths, setDupMonths] = useState<string[]>([]);
  const [dupMode, setDupMode] = useState<DuplicateBudgetMode>("missing_only");
  const [dupBusy, setDupBusy] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: "Orçamento" });
  }, [navigation]);

  const load = useCallback(async () => {
    setError(null);
    const iso = budgetMonthIso(year, month);
    const [data, suggested] = await Promise.all([
      fetchMonthlyBudgetSummary(iso),
      fetchMonthlyBudgetSuggestions(iso).catch(
        () => [] as MonthlyBudgetSuggestion[]
      ),
    ]);
    setRows(data);
    setSuggestions(suggested);
  }, [year, month]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (!hasLoaded.current) setLoading(true);
      void load()
        .catch((err) => {
          if (!cancelled) {
            setError(
              getErrorMessage(err, "Não foi possível carregar o orçamento.")
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
  const overBudget = plannedExpense > 0 && spentExpense > plannedExpense;
  const spentPct =
    plannedExpense > 0 ? (spentExpense / plannedExpense) * 100 : 0;
  const spentAccent = theme.danger;
  const ceilingAccent = overBudget ? theme.danger : "#D97706";

  const unusedSuggestions = useMemo(() => {
    const keys = new Set(
      rows.map((row) => `${row.type_id}-${row.class_id ?? "null"}`)
    );
    return suggestions.filter(
      (item) =>
        item.suggested_value > 0 &&
        !keys.has(`${item.type_id}-${item.class_id ?? "null"}`)
    );
  }, [rows, suggestions]);

  const monthsToCopy = useMemo(() => nextMonths(year, month), [year, month]);

  function openRow(row: MonthlyBudgetSummary) {
    router.push({
      pathname: "/finance/budget-form",
      params: {
        id: String(row.id),
        year: String(year),
        month: String(month),
      },
    });
  }

  async function applySuggestion(item: MonthlyBudgetSuggestion) {
    Alert.alert(
      "Usar sugestão?",
      `${item.class_name ?? item.type_name} · média ${formatBRL(item.average_spent)}. Cria teto de ${formatBRL(item.suggested_value)}.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Criar",
          onPress: () => {
            void (async () => {
              try {
                await createMonthlyBudgetApi({
                  type_id: item.type_id,
                  class_id: item.class_id,
                  budget_month: budgetMonthIso(year, month),
                  planned_value: item.suggested_value,
                });
                setNotice("Teto criado a partir da sugestão.");
                await load();
              } catch (err) {
                setError(
                  getErrorMessage(err, "Não foi possível aplicar a sugestão.")
                );
              }
            })();
          },
        },
      ]
    );
  }

  async function onDuplicate() {
    if (dupMonths.length === 0) {
      setError("Escolha pelo menos um mês de destino.");
      return;
    }
    setDupBusy(true);
    setError(null);
    try {
      await duplicateMonthlyBudgetApi(
        budgetMonthIso(year, month),
        dupMonths,
        dupMode
      );
      setNotice("Orçamento duplicado.");
      setDupOpen(false);
      setDupMonths([]);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Não foi possível duplicar o mês."));
    } finally {
      setDupBusy(false);
    }
  }

  return (
    <ThemedView style={styles.flex}>
      <CollapsibleChrome
        label="Resumo e ações"
        defaultOpen={false}
        hint={[
          overflows.length > 0
            ? `${overflows.length} ${overflows.length === 1 ? "estouro" : "estouros"}`
            : "Filtros e ações",
        ]
          .filter(Boolean)
          .join(" · ")}
        leading={
          <>
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
              <View style={[styles.kpi, tintedSurface(spentAccent)]}>
                <ThemedText
                  type="smallBold"
                  style={[styles.kpiLabel, { color: spentAccent }]}
                >
                  Gasto
                </ThemedText>
                <ThemedText
                  type="smallBold"
                  style={[styles.kpiValue, { color: spentAccent }]}
                >
                  {formatBRL(spentExpense)}
                </ThemedText>
                <View
                  style={[
                    styles.kpiBar,
                    { backgroundColor: hexAlpha(spentAccent, 0.18) },
                  ]}
                >
                  <View
                    style={[
                      styles.kpiBarFill,
                      {
                        width: `${Math.min(100, spentPct)}%`,
                        backgroundColor: spentAccent,
                      },
                    ]}
                  />
                </View>
              </View>
              <View style={[styles.kpi, tintedSurface(ceilingAccent)]}>
                <ThemedText
                  type="smallBold"
                  style={[styles.kpiLabel, { color: ceilingAccent }]}
                >
                  Teto
                </ThemedText>
                <ThemedText
                  type="smallBold"
                  style={[styles.kpiValue, { color: ceilingAccent }]}
                >
                  {formatBRL(plannedExpense)}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {overBudget
                    ? `${formatBRL(spentExpense - plannedExpense)} acima`
                    : `${formatBRL(Math.max(0, plannedExpense - spentExpense))} restantes`}
                </ThemedText>
              </View>
            </View>
            {overflows.length > 0 ? (
              <ThemedText type="small" style={styles.alertTitle}>
                {overflows.length === 1
                  ? "1 estouro neste mês"
                  : `${overflows.length} estouros neste mês`}
              </ThemedText>
            ) : null}
          </>
        }
        footer={
          <>
            <Banner message={error} />
            {notice ? (
              <ThemedText type="small" themeColor="textSecondary">
                {notice}
              </ThemedText>
            ) : null}
          </>
        }
      >
        <View style={styles.kpis}>
          <View
            style={[styles.kpiMuted, { backgroundColor: theme.backgroundElement }]}
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

        <View style={styles.actions}>
          <Pressable
            onPress={() =>
              router.push({
                pathname: "/finance/budget-form",
                params: { year: String(year), month: String(month) },
              })
            }
            style={[styles.actionBtn, { backgroundColor: theme.primary }]}
          >
            <ThemedText type="smallBold" style={styles.actionOn}>
              Criar teto
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => setDupOpen((cur) => !cur)}
            style={[
              styles.actionBtn,
              { backgroundColor: theme.backgroundElement },
            ]}
          >
            <ThemedText type="smallBold">Duplicar mês</ThemedText>
          </Pressable>
        </View>

        {dupOpen ? (
          <View
            style={[styles.dup, { backgroundColor: theme.backgroundElement }]}
          >
            <ThemedText type="small" themeColor="textSecondary">
              Copia os tetos deste mês para os meses escolhidos.
            </ThemedText>
            <View style={styles.chips}>
              {monthsToCopy.map((item) => {
                const on = dupMonths.includes(item.value);
                return (
                  <Pressable
                    key={item.value}
                    onPress={() =>
                      setDupMonths((cur) =>
                        on
                          ? cur.filter((m) => m !== item.value)
                          : [...cur, item.value]
                      )
                    }
                    style={[
                      styles.chip,
                      {
                        backgroundColor: on
                          ? theme.primary
                          : theme.background,
                      },
                    ]}
                  >
                    <ThemedText
                      type="smallBold"
                      style={on ? styles.actionOn : undefined}
                    >
                      {item.label}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.chips}>
              {(
                [
                  ["missing_only", "Só o que falta"],
                  ["replace", "Substituir"],
                ] as const
              ).map(([id, label]) => {
                const on = dupMode === id;
                return (
                  <Pressable
                    key={id}
                    onPress={() => setDupMode(id)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: on
                          ? theme.backgroundSelected
                          : theme.background,
                      },
                    ]}
                  >
                    <ThemedText type="smallBold">{label}</ThemedText>
                  </Pressable>
                );
              })}
            </View>
            <Pressable
              disabled={dupBusy}
              onPress={() => void onDuplicate()}
              style={[styles.dupSave, { backgroundColor: theme.primary }]}
            >
              {dupBusy ? (
                <ActivityIndicator color="#0B0F1A" />
              ) : (
                <ThemedText type="smallBold" style={styles.actionOn}>
                  Duplicar
                </ThemedText>
              )}
            </Pressable>
          </View>
        ) : null}

        {unusedSuggestions.length > 0 ? (
          <View style={styles.suggest}>
            <ThemedText type="smallBold">Sugestões (média 3 meses)</ThemedText>
            {unusedSuggestions.slice(0, 6).map((item) => (
              <Pressable
                key={`${item.type_id}-${item.class_id ?? "p"}`}
                onPress={() => applySuggestion(item)}
                style={styles.suggestRow}
              >
                <View style={styles.suggestCopy}>
                  <ThemedText type="smallBold">
                    {item.class_name ?? item.type_name}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {item.class_name ? item.type_name : "Categoria"} ·{" "}
                    {formatBRL(item.suggested_value)}
                  </ThemedText>
                </View>
                <ThemedText type="linkPrimary">Usar</ThemedText>
              </Pressable>
            ))}
          </View>
        ) : null}
      </CollapsibleChrome>

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
          <BudgetList groups={groups} onPressRow={openRow} />
        </ScrollView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
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
  kpi: {
    flex: 1,
    borderRadius: 14,
    padding: 12,
    gap: 4,
    borderWidth: 1,
  },
  kpiLabel: { textTransform: "uppercase", letterSpacing: 0.3, fontSize: 11 },
  kpiValue: { fontSize: 18, lineHeight: 22 },
  kpiBar: { height: 6, borderRadius: 999, overflow: "hidden", marginTop: 4 },
  kpiBarFill: { height: 6, borderRadius: 999 },
  kpiMuted: { flex: 1, borderRadius: 12, padding: 12, gap: 2 },
  alert: {
    borderRadius: 12,
    padding: 12,
    gap: 4,
    backgroundColor: "#E11D4814",
  },
  alertTitle: { color: "#E11D48" },
  alertText: { color: "#E11D48" },
  actions: { flexDirection: "row", gap: 8 },
  actionBtn: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  actionOn: { color: "#0B0F1A" },
  dup: { borderRadius: 12, padding: 12, gap: 10 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  dupSave: {
    height: 40,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  suggest: { gap: 8 },
  suggestRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  suggestCopy: { flex: 1, gap: 2 },
  list: { padding: Spacing.four },
  error: { color: "#E11D48" },
});
