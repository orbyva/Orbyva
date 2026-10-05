import { ScrollView, StyleSheet, View } from "react-native";

import { Chip, Tabs } from "@/components/ui";

/** Até 4 opções vira segmento (`Tabs`); acima disso, linha de `Chip` (rolável a partir de 6). */
export function ChipBar<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
}) {
  if (options.length <= 4) {
    return (
      <Tabs
        items={options.map((o) => ({ value: o.id, label: o.label }))}
        value={value}
        onValueChange={onChange}
      />
    );
  }

  const chips = options.map((option) => (
    <Chip
      key={option.id}
      label={option.label}
      selected={option.id === value}
      onPress={() => {
        if (option.id !== value) onChange(option.id);
      }}
    />
  ));

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
});
