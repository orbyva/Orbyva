import { Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";

type HubStaleNudgeProps = {
  daysWithoutTx: number;
  onAdd: () => void;
  onDismiss: () => void;
};

export function HubStaleNudge({
  daysWithoutTx,
  onAdd,
  onDismiss,
}: HubStaleNudgeProps) {
  return (
    <View style={styles.card}>
      <View style={styles.copy}>
        <ThemedText type="smallBold">
          Sem lançamentos há {daysWithoutTx} dias.
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Um registro rápido mantém os lançamentos em dia.
        </ThemedText>
      </View>
      <View style={styles.actions}>
        <Pressable onPress={onAdd} style={styles.primary}>
          <ThemedText type="smallBold" style={styles.primaryText}>
            Lançar agora
          </ThemedText>
        </Pressable>
        <Pressable onPress={onDismiss} hitSlop={8} style={styles.dismiss}>
          <ThemedText type="small" themeColor="textSecondary">
            Dispensar
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(217,119,6,0.3)",
    backgroundColor: "rgba(217,119,6,0.1)",
    padding: Spacing.three,
    gap: Spacing.two,
  },
  copy: { gap: 4 },
  actions: { flexDirection: "row", alignItems: "center", gap: Spacing.two },
  primary: {
    backgroundColor: "#0EA5E9",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  primaryText: { color: "#0B0F1A" },
  dismiss: { paddingHorizontal: 8, paddingVertical: 8 },
});
