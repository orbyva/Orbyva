import { StyleSheet, View, type ViewStyle } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Radius } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { hexAlpha } from "@/lib/color";

export function Banner({
  message,
  style,
}: {
  message: string | null;
  style?: ViewStyle;
}) {
  const theme = useTheme();
  if (!message) return null;

  return (
    <View
      style={[
        styles.box,
        { backgroundColor: hexAlpha(theme.destructive, 0.09), borderColor: hexAlpha(theme.destructive, 0.27) },
        style,
      ]}
    >
      <ThemedText type="small" style={{ color: theme.destructive }}>
        {message}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
});
