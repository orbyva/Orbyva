import { Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Button } from "@/components/ui";
import { Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { hexAlpha } from "@/lib/color";

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
  const theme = useTheme();
  return (
    <View
      style={[
        styles.card,
        { borderColor: hexAlpha(theme.warning, 0.3), backgroundColor: hexAlpha(theme.warning, 0.1) },
      ]}
    >
      <View style={styles.copy}>
        <ThemedText type="smallBold">
          Sem lançamentos há {daysWithoutTx} dias.
        </ThemedText>
        <ThemedText type="small" themeColor="mutedForeground">
          Um registro rápido mantém os lançamentos em dia.
        </ThemedText>
      </View>
      <View style={styles.actions}>
        <Button label="Lançar agora" size="sm" onPress={onAdd} />
        <Pressable onPress={onDismiss} hitSlop={8} style={styles.dismiss}>
          <ThemedText type="small" themeColor="mutedForeground">
            Dispensar
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  copy: { gap: 4 },
  actions: { flexDirection: "row", alignItems: "center", gap: Spacing.two },
  dismiss: { paddingHorizontal: 8, paddingVertical: 8 },
});
