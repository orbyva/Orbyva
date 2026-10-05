import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { MonthShareStoryCard } from "@/components/share/MonthShareStoryCard";
import { OpinionShareSheet } from "@/components/share/OpinionShareSheet";
import { ThemedText } from "@/components/themed-text";
import { Button, Card } from "@/components/ui";
import { Spacing } from "@/constants/theme";
import { monthLabel, monthRemainingVsPlan, monthShareText } from "@/domain/monthShare";
import { formatBRL } from "@/lib/currency";

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
  const [open, setOpen] = useState(false);
  const leftover = monthRemainingVsPlan({ receita, despesa, budgetPlanned });
  const saldo = receita - despesa;

  return (
    <Card style={styles.card}>
      <ThemedText type="small" themeColor="mutedForeground">
        Fechamento do mês
      </ThemedText>
      <ThemedText type="smallBold">{monthLabel(year, month)}</ThemedText>
      <View style={styles.row}>
        <View style={styles.cell}>
          <ThemedText type="small" themeColor="mutedForeground">
            Receitas
          </ThemedText>
          <ThemedText type="smallBold">{formatBRL(receita)}</ThemedText>
        </View>
        <View style={styles.cell}>
          <ThemedText type="small" themeColor="mutedForeground">
            Despesas
          </ThemedText>
          <ThemedText type="smallBold">{formatBRL(despesa)}</ThemedText>
        </View>
      </View>
      <ThemedText type="small" themeColor="mutedForeground">
        Saldo {formatBRL(saldo)} · {leftover.label} {formatBRL(leftover.value)}
      </ThemedText>
      <Button
        label="Compartilhar"
        onPress={() => setOpen(true)}
        size="lg"
      />
      <OpinionShareSheet
        visible={open}
        onClose={() => setOpen(false)}
        title={monthLabel(year, month)}
        sheetTitle="Compartilhar mês"
        hasNotes={false}
        message={() =>
          monthShareText({ year, month, receita, despesa, budgetPlanned })
        }
        renderCard={() => (
          <MonthShareStoryCard
            year={year}
            month={month}
            receita={receita}
            despesa={despesa}
            budgetPlanned={budgetPlanned}
          />
        )}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.two, padding: Spacing.three },
  row: { flexDirection: "row", gap: Spacing.three },
  cell: { flex: 1, gap: 2 },
});
