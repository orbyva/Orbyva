import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { useTheme } from "@/hooks/use-theme";

/** Lista rotulada de títulos tocáveis (backlinks, menções, notas ligadas). Vazia = nada. */
export function MentionList({
  caption,
  icon,
  rows,
  onOpen,
}: {
  caption: string;
  icon?: keyof typeof Ionicons.glyphMap;
  rows: readonly { id: string; title: string; excerpt?: string }[];
  onOpen: (id: string) => void;
}) {
  const theme = useTheme();
  if (rows.length === 0) return null;
  return (
    <View style={styles.block}>
      <View style={styles.caption}>
        {icon ? <Ionicons name={icon} size={12} color={theme.textSecondary} /> : null}
        <ThemedText type="small" themeColor="textSecondary">
          {caption}
        </ThemedText>
      </View>
      {rows.map((row) => (
        <Pressable
          key={row.id}
          accessibilityRole="link"
          onPress={() => onOpen(row.id)}
          hitSlop={4}
          style={styles.row}
        >
          <ThemedText type="small" numberOfLines={1} style={{ color: theme.primary }}>
            {row.title || "Sem título"}
          </ThemedText>
          {row.excerpt ? (
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
              {row.excerpt}
            </ThemedText>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 4 },
  caption: { flexDirection: "row", alignItems: "center", gap: 4 },
  row: { paddingVertical: 2 },
});
