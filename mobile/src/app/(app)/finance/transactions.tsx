import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  deleteTransaction,
  fetchTransactionsQuery,
  monthDateRange,
  shiftYearMonth,
  type NatureFilter,
} from "@/api/finance/transactions";
import { TransactionsList } from "@/components/TransactionsList";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { useAppShell } from "@/hooks/use-app-shell";
import { useTheme } from "@/hooks/use-theme";
import { formatBRL } from "@/lib/currency";
import { getErrorMessage } from "@/lib/errors";
import type { Transaction } from "@/types/finance";

const now = new Date();
const PAGE_SIZE = 20;

const NATURE_CHIPS: { id: NatureFilter | "all"; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "Despesa", label: "Despesas" },
  { id: "Receita", label: "Receitas" },
  { id: "Investimento", label: "Investimentos" },
];

function monthTitle(year: number, month: number): string {
  const label = new Date(year, month - 1).toLocaleString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export default function TransactionsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { bottomInset } = useAppShell();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [page, setPage] = useState(1);
  const [nature, setNature] = useState<NatureFilter | "all">("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [rows, setRows] = useState<Transaction[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, nature, year, month]);

  const range = useMemo(() => monthDateRange(year, month), [year, month]);

  const load = useCallback(async () => {
    setError(null);
    const result = await fetchTransactionsQuery({
      page,
      pageSize: PAGE_SIZE,
      startDate: range.start,
      endDate: range.end,
      search: debouncedSearch,
      nature: nature === "all" ? null : nature,
    });
    setRows(result.data);
    setTotalPages(result.totalPages);
    setTotal(result.total);
  }, [page, range.start, range.end, debouncedSearch, nature]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      void load()
        .catch((err) => {
          if (!cancelled) {
            setError(
              getErrorMessage(err, "Não foi possível carregar transações.")
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

  function confirmDelete(tx: Transaction) {
    Alert.alert(
      "Excluir transação?",
      `${tx.description || "Esta transação"} · ${formatBRL(tx.value)}. Esta ação não pode ser desfeita.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Excluir",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await deleteTransaction(tx.id);
                setNotice("Transação removida.");
                await load();
              } catch (err) {
                setError(getErrorMessage(err, "Falha ao excluir transação."));
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
              <ThemedText type="smallBold">{chip.label}</ThemedText>
            </Pressable>
          ))}
        </View>

        {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}
        {notice ? (
          <ThemedText type="small" themeColor="textSecondary">
            {notice}
          </ThemedText>
        ) : null}
        <ThemedText type="small" themeColor="textSecondary">
          {total} {total === 1 ? "transação" : "transações"}
          {totalPages > 1 ? ` · página ${page} de ${totalPages}` : ""}
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
          <TransactionsList
            transactions={rows}
            onEdit={(item) =>
              router.push({
                pathname: "/finance/form",
                params: { id: String(item.id) },
              })
            }
            onDelete={confirmDelete}
          />
          {totalPages > 1 ? (
            <View style={styles.pager}>
              <Pressable
                disabled={page <= 1}
                onPress={() => setPage((p) => Math.max(1, p - 1))}
                style={[
                  styles.pageBtn,
                  { backgroundColor: theme.backgroundElement },
                  page <= 1 && styles.pageBtnDisabled,
                ]}
              >
                <ThemedText type="smallBold">Anterior</ThemedText>
              </Pressable>
              <Pressable
                disabled={page >= totalPages}
                onPress={() => setPage((p) => p + 1)}
                style={[
                  styles.pageBtn,
                  { backgroundColor: theme.backgroundElement },
                  page >= totalPages && styles.pageBtnDisabled,
                ]}
              >
                <ThemedText type="smallBold">Próxima</ThemedText>
              </Pressable>
            </View>
          ) : null}
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
    gap: Spacing.two,
  },
  monthBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  monthTitle: { flex: 1, textAlign: "center" },
  search: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  list: {
    padding: Spacing.four,
    gap: Spacing.two,
  },
  pager: {
    flexDirection: "row",
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  pageBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 12,
  },
  pageBtnDisabled: { opacity: 0.4 },
  error: { color: "#E11D48" },
});
