import { Pressable, StyleSheet, View } from "react-native";

import type { HubBudgetHighlight } from "@/api/hub";
import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { monthLabel } from "@/domain/timeline";
import { formatBRL } from "@/lib/currency";
import type { RecurringDueAlert } from "@/types/recurring";

type HubLedgerHeroProps = {
  year: number;
  month: number;
  saldo: number;
  receita: number;
  despesa: number;
  momDespesa: string | null;
  budgetHighlight: HubBudgetHighlight | null;
  recurringAlerts: RecurringDueAlert[];
  onOpenFinance: () => void;
};

export function HubLedgerHero({
  year,
  month,
  saldo,
  receita,
  despesa,
  momDespesa,
  budgetHighlight,
  recurringAlerts,
  onOpenFinance,
}: HubLedgerHeroProps) {
  const barPct = budgetHighlight
    ? Math.min(100, budgetHighlight.pct)
    : 0;
  const barColor =
    (budgetHighlight?.pct ?? 0) >= 100
      ? "#FECDD3"
      : (budgetHighlight?.pct ?? 0) >= 80
        ? "#FDE68A"
        : "#FFFFFF";

  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <View style={styles.topText}>
          <ThemedText style={styles.kicker} numberOfLines={1}>
            Lançamentos · {monthLabel(year, month)}
          </ThemedText>
          <ThemedText style={styles.muted}>Saldo do mês</ThemedText>
          <ThemedText style={styles.balance} numberOfLines={1}>
            {formatBRL(saldo)}
          </ThemedText>
          {momDespesa ? (
            <ThemedText style={styles.muted}>Despesa {momDespesa}</ThemedText>
          ) : null}
        </View>
        <Pressable onPress={onOpenFinance} style={styles.chip}>
          <ThemedText style={styles.chipText}>Finanças</ThemedText>
        </Pressable>
      </View>

      <View style={styles.totals}>
        <View style={styles.totalCol}>
          <ThemedText style={styles.muted}>Receitas</ThemedText>
          <ThemedText style={styles.totalValue}>{formatBRL(receita)}</ThemedText>
        </View>
        <View style={styles.totalCol}>
          <ThemedText style={styles.muted}>Despesas</ThemedText>
          <ThemedText style={styles.totalValue}>{formatBRL(despesa)}</ThemedText>
        </View>
      </View>

      <View style={styles.footer}>
        <Pressable onPress={onOpenFinance} style={styles.footerCell}>
          <ThemedText style={styles.muted}>Orçamento</ThemedText>
          {budgetHighlight ? (
            <View style={styles.budgetBlock}>
              <ThemedText style={styles.footerValue} numberOfLines={1}>
                {formatBRL(budgetHighlight.spent)}
                <ThemedText style={styles.muted}>
                  {" "}
                  / {formatBRL(budgetHighlight.planned)}
                </ThemedText>
              </ThemedText>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    { width: `${barPct}%`, backgroundColor: barColor },
                  ]}
                />
              </View>
              <ThemedText style={styles.muted}>
                {budgetHighlight.pct.toFixed(0)}% usado
              </ThemedText>
            </View>
          ) : (
            <ThemedText style={styles.footerValue}>Definir teto</ThemedText>
          )}
        </Pressable>
        <Pressable onPress={onOpenFinance} style={styles.footerCell}>
          <ThemedText style={styles.muted}>Parcelas</ThemedText>
          <ThemedText style={styles.footerValue} numberOfLines={2}>
            {recurringAlerts[0]?.message ?? "Nada urgente"}
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#0EA5E9",
    borderRadius: 20,
    overflow: "hidden",
  },
  top: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
  },
  topText: { flex: 1, minWidth: 0, gap: 4 },
  kicker: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  muted: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
  },
  balance: {
    color: "#fff",
    fontSize: 28,
    lineHeight: 36,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  chip: {
    flexShrink: 0,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  totals: {
    flexDirection: "row",
    gap: Spacing.three,
    marginTop: Spacing.three,
    marginHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.22)",
  },
  totalCol: { flex: 1, gap: 2 },
  totalValue: {
    color: "#fff",
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
  },
  footer: {
    flexDirection: "row",
    marginTop: Spacing.three,
    backgroundColor: "rgba(0,0,0,0.12)",
  },
  footerCell: {
    flex: 1,
    paddingHorizontal: Spacing.three,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 4,
  },
  footerValue: {
    color: "#fff",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  budgetBlock: { gap: 4 },
  barTrack: {
    height: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.22)",
    overflow: "hidden",
    marginTop: 4,
  },
  barFill: { height: "100%", borderRadius: 999 },
});
