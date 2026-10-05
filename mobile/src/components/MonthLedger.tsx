import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { TypeIcon } from "@/components/TypeIcon";
import { ThemedText } from "@/components/themed-text";
import { Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { hexAlpha } from "@/lib/color";
import { formatBRL, formatDateBR } from "@/lib/currency";
import type { LedgerTransaction } from "@/types/finance";

const PAGE_SIZE = 8;

export function MonthLedger({
  rows,
  monthLabel,
  nature,
  selectedType,
  onClearFilter,
  onSeeAll,
  onPressRow,
  headerBg,
  rowBg,
}: {
  rows: LedgerTransaction[];
  monthLabel: string;
  nature: "Receita" | "Despesa";
  selectedType: string | null;
  onClearFilter: () => void;
  onSeeAll?: () => void;
  onPressRow?: (tx: LedgerTransaction) => void;
  headerBg: string;
  rowBg: string;
}) {
  const theme = useTheme();
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [rows, selectedType, monthLabel, nature]);

  const visible = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return rows.slice(start, start + PAGE_SIZE);
  }, [page, rows]);

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <View style={styles.headText}>
          <ThemedText type="smallBold">Transações neste mês</ThemedText>
          <ThemedText type="small" themeColor="mutedForeground">
            {rows.length} {rows.length === 1 ? "transação" : "transações"} de{" "}
            {nature} em {monthLabel}
            {selectedType ? ` · ${selectedType}` : ""}
            {totalPages > 1 ? ` · página ${page} de ${totalPages}` : ""}
          </ThemedText>
        </View>
        {selectedType ? (
          <Pressable onPress={onClearFilter} style={[styles.chip, { backgroundColor: hexAlpha(theme.primary, 0.16) }]} hitSlop={8}>
            <ThemedText type="smallBold">{selectedType} ×</ThemedText>
          </Pressable>
        ) : onSeeAll ? (
          <Pressable onPress={onSeeAll} hitSlop={8}>
            <ThemedText type="linkPrimary">Ver todas</ThemedText>
          </Pressable>
        ) : null}
      </View>

      <View style={[styles.tableHead, { backgroundColor: headerBg }]}>
        <ThemedText type="small" style={styles.colDate} themeColor="mutedForeground">
          Data
        </ThemedText>
        <ThemedText type="small" style={styles.colFlex} themeColor="mutedForeground">
          Subcategoria
        </ThemedText>
        <ThemedText
          type="small"
          style={styles.colValue}
          themeColor="mutedForeground"
        >
          Valor
        </ThemedText>
      </View>

      {rows.length === 0 ? (
        <ThemedText themeColor="mutedForeground" style={styles.empty}>
          Nenhuma transação encontrada.
        </ThemedText>
      ) : (
        visible.map((tx) => (
          <Pressable
            key={tx.id}
            onPress={onPressRow ? () => onPressRow(tx) : undefined}
            disabled={!onPressRow}
            style={[styles.row, { backgroundColor: rowBg }]}
          >
            <ThemedText type="small" style={styles.colDate}>
              {formatDateBR(tx.transaction_at)}
            </ThemedText>
            <View style={styles.colFlex}>
              <View style={styles.subRow}>
                <TypeIcon
                  name={tx.class?.type?.lucide_icon}
                  color={tx.class?.type?.hex_color || theme.mutedForeground}
                  size={14}
                />
                <ThemedText numberOfLines={1} style={styles.subName}>
                  {tx.class?.name || "—"}
                </ThemedText>
              </View>
              <ThemedText type="small" themeColor="mutedForeground" numberOfLines={1}>
                {tx.description || "Sem descrição"}
              </ThemedText>
            </View>
            <ThemedText type="smallBold" style={styles.colValue}>
              {formatBRL(tx.value)}
            </ThemedText>
          </Pressable>
        ))
      )}

      {totalPages > 1 ? (
        <View style={styles.pager}>
          <Pressable
            onPress={() => setPage((cur) => Math.max(1, cur - 1))}
            disabled={page <= 1}
            hitSlop={8}
          >
            <ThemedText
              type="linkPrimary"
              style={page <= 1 ? styles.pagerOff : undefined}
            >
              Anterior
            </ThemedText>
          </Pressable>
          <ThemedText type="small" themeColor="mutedForeground">
            {page} / {totalPages}
          </ThemedText>
          <Pressable
            onPress={() => setPage((cur) => Math.min(totalPages, cur + 1))}
            disabled={page >= totalPages}
            hitSlop={8}
          >
            <ThemedText
              type="linkPrimary"
              style={page >= totalPages ? styles.pagerOff : undefined}
            >
              Próxima
            </ThemedText>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  head: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: Spacing.two,
  },
  headText: { flex: 1, gap: 2 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  tableHead: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: Radius.lg,
    gap: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: Radius.lg,
    gap: 8,
  },
  colDate: { width: 72 },
  colFlex: { flex: 1, minWidth: 0 },
  subRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  subName: { flex: 1 },
  colValue: { width: 92, textAlign: "right" },
  empty: { paddingVertical: 12 },
  pager: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 4,
  },
  pagerOff: { opacity: 0.35 },
});
