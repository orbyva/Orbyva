import { Share, Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Card } from "@/components/ui/Card";
import { Spacing } from "@/constants/theme";
import { monthLabel, monthRemainingVsPlan, monthShareText } from "@/domain/monthShare";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-toast";
import { formatBRL } from "@/lib/currency";
import { getErrorMessage } from "@/lib/errors";

export function MonthShareCard({
  year,
  month,
  receita,
  despesa,
  budgetPlanned,
}: {
  year: number;
  month: number;
  receita: number;
  despesa: number;
  budgetPlanned?: number | null;
}) {
  const theme = useTheme();
  const { fail, ok } = useFeedback();
  const leftover = monthRemainingVsPlan({ receita, despesa, budgetPlanned });
  const saldo = receita - despesa;

  async function share() {
    try {
      await Share.share({
        message: monthShareText({ year, month, receita, despesa, budgetPlanned }),
      });
      ok("Pronto para compartilhar");
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível compartilhar."));
    }
  }

  return (
    <Card style={styles.card}>
      <ThemedText type="small" themeColor="textSecondary">
        Fechamento do mês
      </ThemedText>
      <ThemedText type="smallBold">{monthLabel(year, month)}</ThemedText>
      <View style={styles.row}>
        <View style={styles.cell}>
          <ThemedText type="small" themeColor="textSecondary">
            Receitas
          </ThemedText>
          <ThemedText type="smallBold">{formatBRL(receita)}</ThemedText>
        </View>
        <View style={styles.cell}>
          <ThemedText type="small" themeColor="textSecondary">
            Despesas
          </ThemedText>
          <ThemedText type="smallBold">{formatBRL(despesa)}</ThemedText>
        </View>
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        Saldo {formatBRL(saldo)} · {leftover.label} {formatBRL(leftover.value)}
      </ThemedText>
      <Pressable
        onPress={() => void share()}
        style={[styles.btn, { borderColor: theme.backgroundSelected }]}
      >
        <ThemedText type="smallBold">Compartilhar</ThemedText>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.two, padding: Spacing.three },
  row: { flexDirection: "row", gap: Spacing.three },
  cell: { flex: 1, gap: 2 },
  btn: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
});
