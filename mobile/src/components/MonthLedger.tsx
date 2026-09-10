import { Pressable, StyleSheet, View } from "react-native";

import { TypeIcon } from "@/components/TypeIcon";
import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { formatBRL, formatDateBR } from "@/lib/currency";
import type { LedgerTransaction } from "@/types/finance";

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
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <View style={styles.headText}>
          <ThemedText type="smallBold">Transações neste mês</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {rows.length} {rows.length === 1 ? "transação" : "transações"} de{" "}
            {nature} em {monthLabel}
            {selectedType ? ` · ${selectedType}` : ""}
          </ThemedText>
        </View>
        {selectedType ? (
          <Pressable onPress={onClearFilter} style={styles.chip} hitSlop={8}>
            <ThemedText type="smallBold">{selectedType} ×</ThemedText>
          </Pressable>
        ) : onSeeAll ? (
          <Pressable onPress={onSeeAll} hitSlop={8}>
            <ThemedText type="linkPrimary">Ver todas</ThemedText>
          </Pressable>
        ) : null}
      </View>

      <View style={[styles.tableHead, { backgroundColor: headerBg }]}>
        <ThemedText type="small" style={styles.colDate} themeColor="textSecondary">
          Data
        </ThemedText>
        <ThemedText type="small" style={styles.colFlex} themeColor="textSecondary">
          Subcategoria
        </ThemedText>
        <ThemedText
          type="small"
          style={styles.colValue}
          themeColor="textSecondary"
        >
          Valor
        </ThemedText>
      </View>

      {rows.length === 0 ? (
        <ThemedText themeColor="textSecondary" style={styles.empty}>
          Nenhuma transação encontrada.
        </ThemedText>
      ) : (
        rows.map((tx) => (
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
                  color={tx.class?.type?.hex_color || "#64748B"}
                  size={14}
                />
                <ThemedText numberOfLines={1} style={styles.subName}>
                  {tx.class?.name || "—"}
                </ThemedText>
              </View>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {tx.description || "Sem descrição"}
              </ThemedText>
            </View>
            <ThemedText type="smallBold" style={styles.colValue}>
              {formatBRL(tx.value)}
            </ThemedText>
          </Pressable>
        ))
      )}
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
    borderRadius: 999,
    backgroundColor: "rgba(14,165,233,0.16)",
  },
  tableHead: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 8,
  },
  colDate: { width: 72 },
  colFlex: { flex: 1, minWidth: 0 },
  subRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  subName: { flex: 1 },
  colValue: { width: 92, textAlign: "right" },
  empty: { paddingVertical: 12 },
});
