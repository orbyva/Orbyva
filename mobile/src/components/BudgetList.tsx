import { Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Card, EmptyState } from "@/components/ui";
import { Radius, Spacing } from "@/constants/theme";
import {
  getBudgetRealizedValue,
  type BudgetGroup,
} from "@/domain/budget/listView";
import { budgetStatusTone } from "@/domain/ui/semanticTone";
import { useTheme } from "@/hooks/use-theme";
import { formatBRL } from "@/lib/currency";
import type { MonthlyBudgetSummary } from "@/types/finance";

function realizedLabel(row: MonthlyBudgetSummary): string {
  return row.nature_name === "Receita" ? "Recebido" : "Gasto";
}

function remainingLabel(row: MonthlyBudgetSummary): string {
  return row.nature_name === "Receita" ? "A receber" : "Resto";
}

function BudgetRow({
  row,
  title,
  caption,
  nested,
  onPress,
}: {
  row: MonthlyBudgetSummary;
  title: string;
  caption: string;
  nested?: boolean;
  onPress?: (row: MonthlyBudgetSummary) => void;
}) {
  const theme = useTheme();
  const color = theme[budgetStatusTone(row.status)];
  const pct = Math.min(100, Number(row.percentage_used || 0));
  const realized = getBudgetRealizedValue(row);

  return (
    <Pressable onPress={onPress ? () => onPress(row) : undefined}>
      <Card
        style={[
          styles.card,
          nested && {
            marginLeft: 10,
            borderLeftWidth: 3,
            borderLeftColor: theme.primary,
          },
        ]}
      >
      <View style={styles.cardTop}>
        <View style={styles.cardCopy}>
          <ThemedText type="small" themeColor="mutedForeground">
            {caption}
          </ThemedText>
          <ThemedText type="smallBold">{title}</ThemedText>
        </View>
        <ThemedText type="smallBold" style={{ color }}>
          {row.status}
        </ThemedText>
      </View>
      <View style={styles.metrics}>
        <View style={styles.metric}>
          <ThemedText type="small" themeColor="mutedForeground">
            Orçado
          </ThemedText>
          <ThemedText type="smallBold">
            {formatBRL(row.planned_value)}
          </ThemedText>
        </View>
        <View style={styles.metric}>
          <ThemedText type="small" themeColor="mutedForeground">
            {realizedLabel(row)}
          </ThemedText>
          <ThemedText type="smallBold">{formatBRL(realized)}</ThemedText>
        </View>
        <View style={styles.metric}>
          <ThemedText type="small" themeColor="mutedForeground">
            {remainingLabel(row)}
          </ThemedText>
          <ThemedText type="smallBold" style={{ color }}>
            {formatBRL(row.remaining_value)}
          </ThemedText>
        </View>
      </View>
      <View style={[styles.bar, { backgroundColor: theme.border }]}>
        <View
          style={[styles.barFill, { width: `${pct}%`, backgroundColor: color }]}
        />
      </View>
      </Card>
    </Pressable>
  );
}

export function BudgetList({
  groups,
  onPressRow,
}: {
  groups: BudgetGroup[];
  onPressRow?: (row: MonthlyBudgetSummary) => void;
}) {
  if (groups.length === 0) {
    return (
      <EmptyState
        icon="pie-chart-outline"
        title="Nenhum orçamento neste mês"
        description="Use o + para criar um teto."
      />
    );
  }

  return (
    <View style={styles.list}>
      {groups.map(({ typeName, parent, children }) => (
        <View key={typeName} style={styles.group}>
          <BudgetRow
            row={parent}
            title={typeName}
            caption={
              children.length === 0
                ? "Categoria"
                : children.length === 1
                  ? "Categoria · 1 subcategoria"
                  : `Categoria · ${children.length} subcategorias`
            }
            onPress={onPressRow}
          />
          {children.map((row) => (
            <BudgetRow
              key={`${row.id}-${row.class_id}`}
              row={row}
              nested
              title={row.class_name ?? "Sem subcategoria"}
              caption={`Subcategoria · ${typeName}`}
              onPress={onPressRow}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.four },
  group: { gap: Spacing.two },
  card: {
    padding: 14,
    gap: 8,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  cardCopy: { flex: 1, minWidth: 0, gap: 2 },
  metrics: { flexDirection: "row", gap: 8 },
  metric: { flex: 1, gap: 2 },
  bar: { height: 6, borderRadius: Radius.full, overflow: "hidden" },
  barFill: { height: 6, borderRadius: Radius.full },
});
