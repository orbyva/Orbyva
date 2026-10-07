import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { useTheme } from "@/hooks/use-theme";

/** Nota com a estrela amarela cheia, como o `Star fill-warning` do web. */
export function RatingStar({ value, scale }: { value: number | string; scale?: number }) {
  const theme = useTheme();
  return (
    <View
      style={styles.row}
      accessibilityLabel={`Nota ${value}${scale ? ` de ${scale}` : ""}`}
    >
      <Ionicons name="star" size={15} color={theme.warning} />
      <ThemedText type="smallBold">{value}</ThemedText>
      {scale ? (
        <ThemedText type="small" themeColor="mutedForeground">
          /{scale}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 4 },
});
