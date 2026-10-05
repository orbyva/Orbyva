import Ionicons from "@expo/vector-icons/Ionicons";
import type { ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { Radius, Spacing } from "@/constants/theme";
import { TypeScale } from "@/domain/ui/typography";
import { useTheme } from "@/hooks/use-theme";
import { hexAlpha } from "@/lib/color";

/** Mesmas props do `EmptyState` do web (`src/components/EmptyState.tsx`). */
export function EmptyState({
  icon,
  title,
  description,
  action,
  style,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.box, style]}>
      {icon ? (
        <View style={[styles.iconWell, { backgroundColor: hexAlpha(theme.muted, 0.8) }]}>
          <Ionicons name={icon} size={24} color={theme.mutedForeground} />
        </View>
      ) : null}
      <Text style={[TypeScale.bodyStrong, styles.center, { color: theme.foreground }]}>
        {title}
      </Text>
      {description ? (
        <Text style={[TypeScale.label, styles.center, { color: theme.mutedForeground }]}>
          {description}
        </Text>
      ) : null}
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.five,
    gap: Spacing.one,
  },
  iconWell: {
    borderRadius: Radius.full,
    padding: 12,
    marginBottom: Spacing.two,
  },
  center: { textAlign: "center", maxWidth: 320 },
  action: { marginTop: Spacing.three, alignSelf: "stretch", maxWidth: 320, width: "100%" },
});
