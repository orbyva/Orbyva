import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { fetchDimensions } from "@/api/finance/dimensions";
import { ClassSearchPicker } from "@/components/ClassSearchPicker";
import { ThemedText } from "@/components/themed-text";
import { useTheme } from "@/hooks/use-theme";
import type { Dimension } from "@/types/dimensions";

export function LedgerClassField({
  enabled,
  onEnabledChange,
  classId,
  onClassIdChange,
  hint = "Cria um lançamento em Finanças com o mesmo valor.",
}: {
  enabled: boolean;
  onEnabledChange: (next: boolean) => void;
  classId: number | null;
  onClassIdChange: (id: number | null) => void;
  hint?: string;
}) {
  const theme = useTheme();
  const [dimensions, setDimensions] = useState<Dimension[]>([]);

  useEffect(() => {
    void fetchDimensions()
      .then(setDimensions)
      .catch(() => setDimensions([]));
  }, []);

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => onEnabledChange(!enabled)}
        style={[styles.toggle, { backgroundColor: theme.backgroundElement }]}
      >
        <View
          style={[
            styles.dot,
            {
              backgroundColor: enabled ? theme.primary : theme.backgroundSelected,
            },
          ]}
        />
        <View style={styles.copy}>
          <ThemedText type="smallBold">Lançar no extrato</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {hint}
          </ThemedText>
        </View>
      </Pressable>
      {enabled ? (
        <ClassSearchPicker
          dimensions={dimensions}
          value={classId}
          onChange={(opt) => onClassIdChange(opt?.id ?? null)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  toggle: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderRadius: 12,
    padding: 14,
  },
  copy: { flex: 1, gap: 2 },
  dot: { width: 18, height: 18, borderRadius: 9, marginTop: 2 },
});
