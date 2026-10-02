import { Pressable, StyleSheet, View } from "react-native";

import { CATEGORY_COLORS } from "@/domain/dimensions/listView";

export function ColorDots({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
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
            value.toLowerCase() === color.toLowerCase() && styles.dotOn,
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
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "transparent",
  },
  dotOn: { borderColor: "#0B0F1A" },
});
