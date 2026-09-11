import { StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Card } from "@/components/ui/Card";
import { Spacing } from "@/constants/theme";
import {
  getBudgetRealizedValue,
  type BudgetGroup,
} from "@/domain/budget/listView";
import { useTheme } from "@/hooks/use-theme";
import { formatBRL } from "@/lib/currency";
import type { MonthlyBudgetSummary } from "@/types/finance";

function statusColor(status: string): string {
  const key = status
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  if (key === "ESTOUROU" || key === "CRITICO") return "#E11D48";
  if (key === "ATENCAO" || key === "QUASE") return "#D97706";
  return "#16A34A";
}

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
}: {
  row: MonthlyBudgetSummary;
  title: string;
  caption: string;
  nested?: boolean;
}) {
  const theme = useTheme();
  const color = statusColor(row.status);
  const pct = Math.min(100, Number(row.percentage_used || 0));
  const realized = getBudgetRealizedValue(row);

  return (
    <Card
      style={[
        styles.card,
        nested && { marginLeft: 10, borderLeftWidth: 3, borderLeftColor: theme.primary },
      ]}
    >
      <View style={styles.cardTop}>
        <View style={styles.cardCopy}>
          <ThemedText type="small" themeColor="textSecondary">
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
          <ThemedText type="small" themeColor="textSecondary">
            Orçado
          </ThemedText>
          <ThemedText type="smallBold">
            {formatBRL(row.planned_value)}
          </ThemedText>
        </View>
        <View style={styles.metric}>
          <ThemedText type="small" themeColor="textSecondary">
            {realizedLabel(row)}
          </ThemedText>
          <ThemedText type="smallBold">{formatBRL(realized)}</ThemedText>
        </View>
        <View style={styles.metric}>
          <ThemedText type="small" themeColor="textSecondary">
            {remainingLabel(row)}
          </ThemedText>
          <ThemedText type="smallBold" style={{ color }}>
            {formatBRL(row.remaining_value)}
          </ThemedText>
        </View>
      </View>
      <View style={[styles.bar, { backgroundColor: theme.backgroundSelected }]}>
        <View
          style={[styles.barFill, { width: `${pct}%`, backgroundColor: color }]}
        />
      </View>
    </Card>
  );
}

export function BudgetList({ groups }: { groups: BudgetGroup[] }) {
  if (groups.length === 0) {
    return (
      <ThemedText themeColor="textSecondary">
        Nenhum orçamento neste mês. Cadastre tetos no web por enquanto.
      </ThemedText>
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
          />
          {children.map((row) => (
            <BudgetRow
              key={`${row.id}-${row.class_id}`}
              row={row}
              nested
              title={row.class_name ?? "Sem subcategoria"}
              caption={`Subcategoria · ${typeName}`}
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
  bar: { height: 6, borderRadius: 999, overflow: "hidden" },
  barFill: { height: 6, borderRadius: 999 },
});
