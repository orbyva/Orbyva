import { Pressable, StyleSheet, View } from "react-native";

import { Radius } from "@/constants/theme";
import { CATEGORY_COLORS } from "@/domain/dimensions/listView";
import { useTheme } from "@/hooks/use-theme";

export function ColorDots({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      {CATEGORY_COLORS.map((color) => (
        <Pressable
          key={color}
          accessibilityLabel={`Cor ${color}`}
          accessibilityState={{ selected: value.toLowerCase() === color.toLowerCase() }}
          onPress={() => onChange(color)}
          style={[
            styles.dot,
            { backgroundColor: color },
            value.toLowerCase() === color.toLowerCase() && { borderColor: theme.foreground },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  dot: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    borderWidth: 2,
    borderColor: "transparent",
  },
});
