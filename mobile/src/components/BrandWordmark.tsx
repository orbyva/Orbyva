import { StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/hooks/use-theme";
import { BRAND } from "@/lib/brand";

const SKY = "#0EA5E9";

export function BrandWordmark({
  showSubtitle = true,
}: {
  showSubtitle?: boolean;
}) {
  const theme = useTheme();

  return (
    <View style={styles.wrap} accessibilityLabel={BRAND.name}>
      <Text style={styles.name} numberOfLines={1}>
        <Text style={styles.accent}>O</Text>
        <Text style={{ color: theme.text }}>RBYV</Text>
        <Text style={styles.accent}>Ʌ</Text>
      </Text>
      {showSubtitle ? (
        <Text
          style={[styles.wedge, { color: theme.textSecondary }]}
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
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 1.6,
    textTransform: "uppercase",
    lineHeight: 18,
  },
  accent: { color: SKY },
  wedge: {
    fontSize: 10,
    letterSpacing: 0.4,
    lineHeight: 13,
  },
});
