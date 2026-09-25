import Ionicons from "@expo/vector-icons/Ionicons";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

export function ModuleSection({
  title,
  icon,
  tint,
  badge,
  actionLabel,
  onAction,
  children,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  badge?: string;
  actionLabel?: string;
  onAction?: () => void;
  children: ReactNode;
}) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.block,
        { backgroundColor: theme.surface, borderColor: theme.backgroundSelected },
      ]}
    >
      <View style={[styles.head, { borderBottomColor: theme.backgroundSelected }]}>
        <View style={[styles.iconWell, { backgroundColor: `${tint}22` }]}>
          <Ionicons name={icon} size={16} color={tint} />
        </View>
        <ThemedText type="smallBold" style={styles.title}>
          {title}
        </ThemedText>
        {badge ? (
          <ThemedText type="small" themeColor="textSecondary">
            {badge}
          </ThemedText>
        ) : null}
        {actionLabel && onAction ? (
          <Pressable onPress={onAction} hitSlop={8}>
            <ThemedText type="linkPrimary">{actionLabel}</ThemedText>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    borderRadius: Radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconWell: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { flex: 1 },
  body: { paddingHorizontal: 14, paddingVertical: 12, gap: Spacing.two },
});
