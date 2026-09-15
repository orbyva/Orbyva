import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { StringSelectModal } from "@/components/StringSelectModal";
import { ThemedText } from "@/components/themed-text";
import { Radius } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { hexAlpha } from "@/lib/color";

export function FilterRow({ children }: { children: ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

export function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { id: string; label: string }[];
  onChange: (id: string) => void;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.id === value);
  const filtered = value !== "all" && value !== "default";

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={[
          styles.chip,
          {
            backgroundColor: filtered
              ? hexAlpha(theme.primary, 0.14)
              : theme.backgroundElement,
            borderColor: filtered ? theme.primary : "transparent",
          },
        ]}
      >
        <ThemedText
          type="smallBold"
          numberOfLines={1}
          style={filtered ? { color: theme.primary } : undefined}
        >
          {filtered ? current?.label ?? label : label}
        </ThemedText>
        <ThemedText
          type="small"
          style={{ color: filtered ? theme.primary : theme.textSecondary }}
        >
          ▾
        </ThemedText>
      </Pressable>
      <StringSelectModal
        visible={open}
        title={label}
        options={options}
        selectedId={value}
        onSelect={onChange}
        onClose={() => setOpen(false)}
        searchable={options.length > 8}
      />
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: Radius.chip,
    paddingHorizontal: 12,
    paddingVertical: 9,
    maxWidth: 180,
    borderWidth: 1,
  },
});
