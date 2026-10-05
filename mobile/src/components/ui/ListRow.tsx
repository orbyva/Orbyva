import Ionicons from "@expo/vector-icons/Ionicons";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { Spacing } from "@/constants/theme";
import { TypeScale } from "@/domain/ui/typography";
import { useTheme } from "@/hooks/use-theme";

/** Linha de lista padrão: transações, tarefas, itens — mesma altura e recuo em todo o app. */
export function ListRow({
  title,
  subtitle,
  left,
  trailing,
  chevron = false,
  onPress,
  onLongPress,
  style,
}: {
  title: string;
  subtitle?: string | null;
  left?: ReactNode;
  trailing?: ReactNode;
  chevron?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const body = (
    <>
      {left ? <View style={styles.left}>{left}</View> : null}
      <View style={styles.copy}>
        <Text style={[TypeScale.bodyStrong, { color: theme.foreground }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[TypeScale.caption, { color: theme.mutedForeground }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      {chevron ? (
        <Ionicons name="chevron-forward" size={16} color={theme.mutedForeground} />
      ) : null}
    </>
  );

  if (!onPress && !onLongPress) return <View style={[styles.row, style]}>{body}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.muted }, style]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 56,
    paddingHorizontal: Spacing.three,
    paddingVertical: 10,
  },
  left: { alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  trailing: { alignItems: "flex-end", gap: 2 },
});
