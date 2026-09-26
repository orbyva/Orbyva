import { ActivityIndicator, Pressable, StyleSheet } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { useTheme } from "@/hooks/use-theme";
import { hexAlpha } from "@/lib/color";

export function FormButton({
  label,
  onPress,
  tone = "neutral",
  disabled,
  busy,
  compact,
  flex,
}: {
  label: string;
  onPress: () => void;
  tone?: "neutral" | "primary" | "danger";
  disabled?: boolean;
  busy?: boolean;
  compact?: boolean;
  flex?: boolean;
}) {
  const theme = useTheme();
  const backgroundColor =
    tone === "primary" ? theme.primary : theme.surface;
  const borderColor =
    tone === "primary"
      ? theme.primary
      : tone === "danger"
        ? hexAlpha(theme.danger, 0.55)
        : theme.backgroundSelected;
  const color =
    tone === "primary" ? "#FFFFFF" : tone === "danger" ? theme.danger : theme.text;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        compact ? styles.compact : styles.block,
        flex ? styles.flex : null,
        {
          backgroundColor,
          borderColor,
          opacity: disabled ? 0.45 : pressed ? 0.86 : 1,
        },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={color} />
      ) : (
        <ThemedText type="smallBold" style={{ color }}>
          {label}
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    shadowColor: "#0B0F1A",
    shadowOpacity: 0.06,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  block: {
    alignSelf: "stretch",
    minHeight: 40,
  },
  compact: {
    alignSelf: "auto",
    minHeight: 36,
    paddingHorizontal: 12,
  },
  flex: { flex: 1 },
});
