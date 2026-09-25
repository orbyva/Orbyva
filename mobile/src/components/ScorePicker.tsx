import { Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { formatMovieRating, getMovieRatingLabel } from "@/domain/movies";
import { useTheme } from "@/hooks/use-theme";
import { hexAlpha } from "@/lib/color";

const SCORES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export function ScorePicker({
  value,
  onChange,
  compact,
}: {
  value: number | null;
  onChange: (next: number | null) => void;
  compact?: boolean;
}) {
  const theme = useTheme();
  const size = compact ? 36 : 44;
  const halfAt = compact ? 18 : 22;

  return (
    <View style={styles.wrap}>
      <ThemedText type="small" themeColor="textSecondary">
        {value != null
          ? `${formatMovieRating(value)}/10 · ${getMovieRatingLabel(value)}`
          : "Opcional — toque à esquerda para .5, à direita para inteiro"}
      </ThemedText>
      <View style={styles.scores}>
        {SCORES.map((score) => {
          const fill =
            value != null && value >= score
              ? "full"
              : value != null && value >= score - 0.5
                ? "half"
                : "empty";
          return (
            <Pressable
              key={score}
              onPress={(event) => {
                const x = event.nativeEvent.locationX;
                const next = x < halfAt ? score - 0.5 : score;
                onChange(value === next ? null : next);
              }}
              style={[
                styles.score,
                {
                  width: size,
                  height: size,
                  backgroundColor:
                    fill === "full"
                      ? theme.primary
                      : fill === "half"
                        ? hexAlpha(theme.primary, 0.28)
                        : theme.backgroundElement,
                  borderColor: fill === "empty" ? "transparent" : theme.primary,
                },
              ]}
            >
              {fill === "half" ? (
                <View
                  pointerEvents="none"
                  style={[
                    styles.halfFill,
                    { backgroundColor: hexAlpha(theme.primary, 0.55) },
                  ]}
                />
              ) : null}
              <ThemedText
                type="smallBold"
                style={{
                  color: fill === "full" ? "#FFFFFF" : theme.text,
                  zIndex: 1,
                }}
              >
                {score}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  scores: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  score: {
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    overflow: "hidden",
  },
  halfFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: "50%",
  },
});
