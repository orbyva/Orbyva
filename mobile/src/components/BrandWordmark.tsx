import { StyleSheet, Text, View } from "react-native";

import { TypeScale, weightStyle } from "@/domain/ui/typography";
import { useTheme } from "@/hooks/use-theme";
import { BRAND } from "@/lib/brand";

export function BrandWordmark({
  showSubtitle = true,
}: {
  showSubtitle?: boolean;
}) {
  const theme = useTheme();

  return (
    <View style={styles.wrap} accessibilityLabel={BRAND.name}>
      <Text style={styles.name} numberOfLines={1}>
        <Text style={{ color: theme.primary }}>O</Text>
        <Text style={{ color: theme.foreground }}>RBYV</Text>
        <Text style={{ color: theme.primary }}>Ʌ</Text>
      </Text>
      {showSubtitle ? (
        <Text
          style={[styles.wedge, { color: theme.mutedForeground }]}
          numberOfLines={1}
        >
          {BRAND.wedge}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { minWidth: 0, gap: 2 },
  name: {
    ...TypeScale.label,
    ...weightStyle(700),
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
  wedge: {
    ...TypeScale.nano,
    ...weightStyle(400),
    letterSpacing: 0.4,
  },
});
