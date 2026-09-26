import { Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import type { OrbAskUser } from "@/domain/orb/clarify";
import { useTheme } from "@/hooks/use-theme";

export function OrbClarifyCard({
  ask,
  onReply,
  disabled = false,
}: {
  ask: OrbAskUser;
  onReply?: (texto: string) => void;
  disabled?: boolean;
}) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.card,
        {
          borderColor: theme.backgroundSelected,
          backgroundColor: theme.backgroundElement,
        },
      ]}
    >
      <ThemedText type="smallBold">{ask.question}</ThemedText>
      {ask.suggestions.length > 0 ? (
        <View style={styles.chips}>
          {ask.suggestions.map((sugestao) => (
            <Pressable
              key={sugestao}
              disabled={disabled || !onReply}
              onPress={() => onReply?.(sugestao)}
              style={[
                styles.chip,
                {
                  borderColor: theme.primary,
                  opacity: disabled || !onReply ? 0.5 : 1,
                },
              ]}
            >
              <ThemedText type="small" style={{ color: theme.primary }}>
                {sugestao}
              </ThemedText>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.one },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: 6,
  },
});
