import { useFocusEffect, useNavigation } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import {
  fetchLastPaidAtByRecurring,
  fetchRecurringTransactions,
  updateRecurringParcelPayment,
} from "@/api/finance/recurring";
import { RecurringList } from "@/components/RecurringList";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner } from "@/components/ui/Banner";
import { Spacing } from "@/constants/theme";
import {
  filterRecurringList,
  getRecurringDueAlerts,
  isRecurringPaidInMonth,
  recurringInstallmentInMonth,
  type RecurringFilter,
} from "@/domain/recurring/alerts";
import { getRecurringActionCopy } from "@/domain/recurring/copy";
import {
  countRecurringByNature,
  filterRecurringByNature,
  filterRecurringBySearch,
  filterRecurringByYearMonth,
  sumRecurringActiveInMonth,
  type RecurringNatureFilter,
} from "@/domain/recurring/listView";
import { useAppShell } from "@/hooks/use-app-shell";
import { useTheme } from "@/hooks/use-theme";
import { shiftYearMonth } from "@/api/finance/transactions";
import { formatBRL } from "@/lib/currency";
import { getErrorMessage } from "@/lib/errors";
import type { Recurring } from "@/types/recurring";

const now = new Date();

const STATUS_CHIPS: { id: RecurringFilter; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "open", label: "Em aberto" },
  { id: "paid", label: "Pagas" },
  { id: "overdue", label: "Atrasadas" },
];

const NATURE_CHIPS: { id: RecurringNatureFilter; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "pay", label: "A pagar" },
  { id: "receive", label: "A receber" },
];

function monthTitle(year: number, month: number): string {
  const label = new Date(year, month - 1).toLocaleString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export default function RecurringScreen() {
  const theme = useTheme();
  const navigation = useNavigation();
  const { bottomInset } = useAppShell();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [nature, setNature] = useState<RecurringNatureFilter>("all");
  const [status, setStatus] = useState<RecurringFilter>("all");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<Recurring[]>([]);
  const [lastPaidAtById, setLastPaidAtById] = useState<Record<string, string>>(
    {}
  );
  const [loading, setLoading] = useState(true);
  const hasLoaded = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: "Recorrências" });
  }, [navigation]);

  const load = useCallback(async () => {
    setError(null);
    const [data, paidMap] = await Promise.all([
      fetchRecurringTransactions(),
      fetchLastPaidAtByRecurring().catch(() => ({}) as Record<string, string>),
    ]);
    setRows(data);
    setLastPaidAtById(paidMap);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (!hasLoaded.current) setLoading(true);
      void load()
        .catch((err) => {
          if (!cancelled) {
            setError(getErrorMessage(err, "Não foi possível carregar recorrências."));
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

  const monthBase = useMemo(
    () => filterRecurringByYearMonth(rows, year, month),
    [rows, year, month]
  );
  const monthTotals = useMemo(
    () => sumRecurringActiveInMonth(rows, year, month),
    [rows, year, month]
  );
  const searched = useMemo(
    () => filterRecurringBySearch(monthBase, search),
    [monthBase, search]
  );
  const natureBase = useMemo(
    () => filterRecurringByNature(searched, nature),
    [searched, nature]
  );
  const dueAlerts = useMemo(
    () => getRecurringDueAlerts(monthBase),
    [monthBase]
  );
  const filtered = useMemo(
    () => filterRecurringList(natureBase, status, dueAlerts, year, month),
    [natureBase, status, dueAlerts, year, month]
  );
  const natureCounts = useMemo(
    () => countRecurringByNature(searched),
    [searched]
  );

  function confirmToggle(rec: Recurring, installmentNumber: number, paid: boolean) {
    const copy = getRecurringActionCopy(rec);
    Alert.alert(
      paid ? copy.unmarkTitle : copy.markTitle,
      paid ? copy.unmarkHint : copy.markHint,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Confirmar",
          onPress: () => {
            void (async () => {
              setBusyId(rec.id);
              setError(null);
              const current = rec.paid_parcels || [];
              try {
                const next = await updateRecurringParcelPayment(
                  rec.id,
                  installmentNumber,
                  current,
                  paid ? undefined : new Date().toISOString().slice(0, 10)
                );
                setRows((prev) =>
                  prev.map((item) =>
                    item.id === rec.id ? { ...item, paid_parcels: next } : item
                  )
                );
                setNotice(paid ? copy.unmarkToast : copy.markToast);
                const paidMap = await fetchLastPaidAtByRecurring().catch(
                  () => lastPaidAtById
                );
                setLastPaidAtById(paidMap);
              } catch (err) {
                setError(
                  getErrorMessage(err, "Não foi possível atualizar a parcela.")
                );
              } finally {
                setBusyId(null);
              }
            })();
          },
        },
      ]
    );
  }

  return (
    <ThemedView style={styles.flex}>
      <View style={styles.filters}>
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

        <ThemedText type="small" themeColor="textSecondary">
          A receber {formatBRL(monthTotals.receive)} · a pagar{" "}
          {formatBRL(monthTotals.pay)}
        </ThemedText>

        <TextInput
          placeholder="Buscar descrição, categoria..."
          placeholderTextColor={theme.textSecondary}
          value={search}
          onChangeText={setSearch}
          style={[
            styles.search,
            {
              color: theme.text,
              backgroundColor: theme.backgroundElement,
              borderColor: theme.backgroundSelected,
            },
          ]}
        />

        <View style={styles.chips}>
          {NATURE_CHIPS.map((chip) => (
            <Pressable
              key={chip.id}
              onPress={() => setNature(chip.id)}
              style={[
                styles.chip,
                { backgroundColor: theme.backgroundElement },
                nature === chip.id && {
                  backgroundColor: theme.backgroundSelected,
                },
              ]}
            >
              <ThemedText type="smallBold">
                {chip.label}
                {chip.id === "pay" ? ` · ${natureCounts.pay}` : ""}
                {chip.id === "receive" ? ` · ${natureCounts.receive}` : ""}
              </ThemedText>
            </Pressable>
          ))}
        </View>
        <View style={styles.chips}>
          {STATUS_CHIPS.map((chip) => (
            <Pressable
              key={chip.id}
              onPress={() => setStatus(chip.id)}
              style={[
                styles.chip,
                { backgroundColor: theme.backgroundElement },
                status === chip.id && {
                  backgroundColor: theme.backgroundSelected,
                },
              ]}
            >
              <ThemedText type="smallBold">{chip.label}</ThemedText>
            </Pressable>
          ))}
        </View>

        <Banner message={error} />
        {notice ? (
          <ThemedText type="small" themeColor="textSecondary">
            {notice}
          </ThemedText>
        ) : null}
        <ThemedText type="small" themeColor="textSecondary">
          {filtered.length}{" "}
          {filtered.length === 1 ? "recorrência" : "recorrências"}
        </ThemedText>
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
          <RecurringList
            items={filtered}
            year={year}
            month={month}
            lastPaidAtById={lastPaidAtById}
            busyId={busyId}
            onToggleMonth={(rec) => {
              const inst = recurringInstallmentInMonth(rec, year, month);
              if (!inst) return;
              confirmToggle(
                rec,
                inst.number,
                isRecurringPaidInMonth(rec, year, month)
              );
            }}
            onToggleInstallment={(rec, number, paid) =>
              confirmToggle(rec, number, paid)
            }
          />
        </ScrollView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  filters: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    gap: Spacing.two,
  },
  monthRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  monthBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  monthTitle: { flex: 1, textAlign: "center" },
  search: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  list: { padding: Spacing.four, gap: Spacing.three },
  error: { color: "#E11D48" },
});
