import Ionicons from "@expo/vector-icons/Ionicons";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { hexAlpha } from "@/lib/color";

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
        { backgroundColor: theme.card, borderColor: theme.border },
      ]}
    >
      <View style={[styles.head, { borderBottomColor: theme.border }]}>
        <View style={[styles.iconWell, { backgroundColor: hexAlpha(tint, 0.13) }]}>
          <Ionicons name={icon} size={16} color={tint} />
        </View>
        <ThemedText type="bodyStrong" style={styles.title}>
          {title}
        </ThemedText>
        {badge ? (
          <ThemedText type="small" themeColor="mutedForeground">
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
    borderRadius: Radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconWell: {
    width: 32,
    height: 32,
    borderRadius: Radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { flex: 1 },
  body: { paddingHorizontal: Spacing.three, paddingVertical: 12, gap: Spacing.two },
});
