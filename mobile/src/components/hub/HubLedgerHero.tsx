import { Pressable, StyleSheet, View } from "react-native";

import type { HubBudgetHighlight } from "@/api/hub";
import { ThemedText } from "@/components/themed-text";
import { Radius, Spacing } from "@/constants/theme";
import { heroBudgetBarColor } from "@/domain/hub/heroColors";
import { monthLabel } from "@/domain/timeline";
import { scrim } from "@/domain/ui/color";
import { TypeScale } from "@/domain/ui/typography";
import { useTheme } from "@/hooks/use-theme";
import { hexAlpha } from "@/lib/color";
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
  const theme = useTheme();
  const barColor = heroBudgetBarColor(budgetHighlight?.pct ?? 0, theme);
  const on = { color: theme.primaryForeground };
  const muted = { color: hexAlpha(theme.primaryForeground, 0.72) };
  const hairline = hexAlpha(theme.primaryForeground, 0.22);

  return (
    <View style={[styles.card, { backgroundColor: theme.primary }]}>
      <View style={styles.top}>
        <View style={styles.topText}>
          <ThemedText style={[styles.kicker, muted]} numberOfLines={1}>
            Lançamentos · {monthLabel(year, month)}
          </ThemedText>
          <ThemedText style={[styles.muted, muted]}>Saldo do mês</ThemedText>
          <ThemedText style={[styles.balance, on]} numberOfLines={1}>
            {formatBRL(saldo)}
          </ThemedText>
          {momDespesa ? (
            <ThemedText style={[styles.muted, muted]}>Despesa {momDespesa}</ThemedText>
          ) : null}
        </View>
        <Pressable
          onPress={onOpenFinance}
          style={[styles.chip, { backgroundColor: hexAlpha(theme.primaryForeground, 0.14) }]}
        >
          <ThemedText style={[styles.chipText, on]}>Finanças</ThemedText>
        </Pressable>
      </View>

      <View style={[styles.totals, { borderTopColor: hairline }]}>
        <View style={styles.totalCol}>
          <ThemedText style={[styles.muted, muted]}>Receitas</ThemedText>
          <ThemedText style={[styles.totalValue, on]}>{formatBRL(receita)}</ThemedText>
        </View>
        <View style={styles.totalCol}>
          <ThemedText style={[styles.muted, muted]}>Despesas</ThemedText>
          <ThemedText style={[styles.totalValue, on]}>{formatBRL(despesa)}</ThemedText>
        </View>
      </View>

      <View style={[styles.footer, { backgroundColor: scrim(0.12) }]}>
        <Pressable onPress={onOpenFinance} style={styles.footerCell}>
          <ThemedText style={[styles.muted, muted]}>Orçamento</ThemedText>
          {budgetHighlight ? (
            <View style={styles.budgetBlock}>
              <ThemedText style={[styles.footerValue, on]} numberOfLines={1}>
                {formatBRL(budgetHighlight.spent)}
                <ThemedText style={[styles.muted, muted]}>
                  {" "}
                  / {formatBRL(budgetHighlight.planned)}
                </ThemedText>
              </ThemedText>
              <View style={[styles.barTrack, { backgroundColor: hairline }]}>
                <View
                  style={[
                    styles.barFill,
                    { width: `${barPct}%`, backgroundColor: barColor },
                  ]}
                />
              </View>
              <ThemedText style={[styles.muted, muted]}>
                {budgetHighlight.pct.toFixed(0)}% usado
              </ThemedText>
            </View>
          ) : (
            <ThemedText style={[styles.footerValue, on]}>Definir teto</ThemedText>
          )}
        </Pressable>
        <Pressable onPress={onOpenFinance} style={styles.footerCell}>
          <ThemedText style={[styles.muted, muted]}>Parcelas</ThemedText>
          <ThemedText style={[styles.footerValue, on]} numberOfLines={2}>
            {recurringAlerts[0]?.message ?? "Nada urgente"}
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.xl,
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
    ...TypeScale.nano,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  muted: TypeScale.micro,
  balance: { ...TypeScale.display, letterSpacing: -0.4 },
  chip: {
    flexShrink: 0,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipText: TypeScale.micro,
  totals: {
    flexDirection: "row",
    gap: Spacing.three,
    marginTop: Spacing.three,
    marginHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  totalCol: { flex: 1, gap: 2 },
  totalValue: TypeScale.bodyStrong,
  footer: {
    flexDirection: "row",
    marginTop: Spacing.three,
  },
  footerCell: {
    flex: 1,
    paddingHorizontal: Spacing.three,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 4,
  },
  footerValue: TypeScale.label,
  budgetBlock: { gap: 4 },
  barTrack: {
    height: 4,
    borderRadius: Radius.full,
    overflow: "hidden",
    marginTop: 4,
  },
  barFill: { height: "100%", borderRadius: Radius.full },
});
