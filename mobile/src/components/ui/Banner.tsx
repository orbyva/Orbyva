import { StyleSheet, View, type ViewStyle } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Radius } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

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
        { backgroundColor: `${theme.danger}18`, borderColor: `${theme.danger}44` },
        style,
      ]}
    >
      <ThemedText type="small" style={{ color: theme.danger }}>
        {message}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: Radius.control,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
});
