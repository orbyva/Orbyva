import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Radius } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { hexAlpha } from "@/lib/color";

export function ChipBar<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
}) {
  const theme = useTheme();

  if (options.length <= 4) {
    return (
      <View style={styles.segmentWrap}>
        <View
          style={[
            styles.segmentTrack,
            { backgroundColor: theme.backgroundElement },
            options.length === 3 && styles.segmentTrackWide,
            options.length === 4 && styles.segmentTrackFull,
          ]}
        >
          {options.map((option) => {
            const active = option.id === value;
            return (
              <Pressable
                key={option.id}
                onPress={() => {
                  if (option.id === value) return;
                  onChange(option.id);
                }}
                style={[
                  styles.segment,
                  options.length === 4 && styles.segmentTight,
                  active && { backgroundColor: theme.primary },
                ]}
              >
                <ThemedText
                  type="smallBold"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                  style={{
                    color: active ? "#FFFFFF" : theme.textSecondary,
                    textAlign: "center",
                  }}
                >
                  {option.label}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }

  const chips = options.map((option) => {
    const active = option.id === value;
    return (
      <Pressable
        key={option.id}
        onPress={() => {
          if (option.id === value) return;
          onChange(option.id);
        }}
        style={[
          styles.chip,
          {
            backgroundColor: active
              ? hexAlpha(theme.primary, 0.16)
              : theme.backgroundElement,
            borderColor: active ? theme.primary : "transparent",
          },
        ]}
      >
        <ThemedText
          type="smallBold"
          style={active ? { color: theme.primary } : undefined}
        >
          {option.label}
        </ThemedText>
      </Pressable>
    );
  });

  if (options.length <= 5) {
    return <View style={styles.row}>{chips}</View>;
  }

  return (
    <ScrollView
      horizontal
      nestedScrollEnabled
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {chips}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  segmentWrap: { alignItems: "center" },
  segmentTrack: {
    flexDirection: "row",
    borderRadius: 999,
    padding: 4,
    width: "100%",
    maxWidth: 360,
  },
  segmentTrackWide: { maxWidth: 440 },
  segmentTrackFull: { maxWidth: "100%" },
  segment: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 999,
  },
  segmentTight: { paddingHorizontal: 4, paddingVertical: 9 },
  row: { flexDirection: "row", flexWrap: "nowrap", gap: 8, paddingRight: 8 },
  chip: {
    borderRadius: Radius.chip,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexShrink: 0,
    borderWidth: 1,
  },
});
