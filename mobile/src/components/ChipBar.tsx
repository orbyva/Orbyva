import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Radius } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

export function ChipBar<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
}) {
  const theme = useTheme();
  const chips = options.map((option) => {
    const active = option.id === value;
    return (
      <Pressable
        key={option.id}
        onPress={() => {
          if (option.id === value) return;
          onChange(option.id);
        }}
        style={[
          styles.chip,
          { backgroundColor: theme.backgroundElement },
          active && { backgroundColor: theme.backgroundSelected },
        ]}
      >
        <ThemedText type="smallBold">{option.label}</ThemedText>
      </Pressable>
    );
  });

  if (options.length <= 5) {
    return <View style={styles.row}>{chips}</View>;
  }

  return (
    <ScrollView
      horizontal
      nestedScrollEnabled
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {chips}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "nowrap", gap: 8, paddingRight: 8 },
  chip: {
    borderRadius: Radius.chip,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexShrink: 0,
  },
});
