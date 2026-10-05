import { StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Card } from "@/components/ui";
import { Spacing } from "@/constants/theme";

export function InsightsStrip({
  items,
}: {
  items: { label: string; value: string | number }[];
}) {
  return (
    <Card style={styles.card}>
      {items.map((item) => (
        <View key={item.label} style={styles.cell}>
          <ThemedText type="smallBold">{item.value}</ThemedText>
          <ThemedText type="small" themeColor="mutedForeground">
            {item.label}
          </ThemedText>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.two,
    flexDirection: "row",
  },
  cell: { flex: 1, alignItems: "center", gap: 2 },
});
