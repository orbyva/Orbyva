import type { ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { Spacing } from "@/constants/theme";
import { TypeScale } from "@/domain/ui/typography";
import { useTheme } from "@/hooks/use-theme";

/**
 * Bloco de título no conteúdo da tela (título em Syne + subtítulo + ações). Não substitui o
 * header nativo do stack — esse muda só na rodada de navegação.
 */
export function ScreenHeader({
  title,
  subtitle,
  actions,
  style,
}: {
  title: string;
  subtitle?: string | null;
  actions?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.row, style]}>
      <View style={styles.copy}>
        <Text accessibilityRole="header" style={[TypeScale.title, { color: theme.foreground }]}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[TypeScale.label, { color: theme.mutedForeground }]}>{subtitle}</Text>
        ) : null}
      </View>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: Spacing.three,
    paddingBottom: Spacing.two,
  },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  actions: { flexDirection: "row", alignItems: "center", gap: Spacing.two },
});
