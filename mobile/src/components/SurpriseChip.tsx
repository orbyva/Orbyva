import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Radius } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { hexAlpha } from "@/lib/color";

export function SurpriseChip({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Me surpreenda"
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: hexAlpha(theme.primary, 0.16),
          borderColor: hexAlpha(theme.primary, 0.42),
          opacity: pressed ? 0.86 : 1,
        },
      ]}
    >
      <Ionicons name="color-wand-outline" size={15} color={theme.primary} />
      <ThemedText type="smallBold" style={{ color: theme.primary }}>
        Me surpreenda
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: Radius.chip,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
});
