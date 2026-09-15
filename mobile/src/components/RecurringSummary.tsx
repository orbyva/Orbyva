import { StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { tintedSurface } from "@/lib/color";
import { formatBRL } from "@/lib/currency";

export function RecurringSummary({
  receive,
  pay,
  periodLabel,
}: {
  receive: number;
  pay: number;
  periodLabel?: string;
}) {
  const theme = useTheme();
  const suffix = periodLabel ? ` · ${periodLabel}` : "";

  return (
    <View style={styles.row}>
      <View style={[styles.card, tintedSurface(theme.success)]}>
        <ThemedText
          type="smallBold"
          style={[styles.label, { color: theme.success, borderBottomColor: theme.success }]}
        >
          {`A receber no mês${suffix}`}
        </ThemedText>
        <ThemedText type="smallBold" style={[styles.value, { color: theme.success }]}>
          {formatBRL(receive)}
        </ThemedText>
      </View>
      <View style={[styles.card, tintedSurface(theme.danger)]}>
        <ThemedText
          type="smallBold"
          style={[styles.label, { color: theme.danger, borderBottomColor: theme.danger }]}
        >
          {`A pagar no mês${suffix}`}
        </ThemedText>
        <ThemedText type="smallBold" style={[styles.value, { color: theme.danger }]}>
          {formatBRL(pay)}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: Spacing.two },
  card: {
    flex: 1,
    borderRadius: 16,
    padding: Spacing.three,
    gap: 8,
    borderWidth: 1,
  },
  label: {
    textTransform: "uppercase",
    letterSpacing: 0.3,
    borderBottomWidth: 2,
    paddingBottom: 6,
    fontSize: 11,
    lineHeight: 14,
  },
  value: { fontSize: 18, lineHeight: 24 },
});
