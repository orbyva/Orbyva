import { Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import {
  heatmapRateLabel,
  monthHeatmapHeaders,
  monthLabel,
} from "@/domain/habits/heatmap";
import { useTheme } from "@/hooks/use-theme";
import type { HabitHeatCell, MonthHeatmap } from "@/types/habits";

function cellColor(
  cell: HabitHeatCell,
  avoid: boolean,
  theme: ReturnType<typeof useTheme>
): string {
  if (cell.status === "future") return theme.backgroundSelected;
  if (cell.status === "empty") return theme.backgroundElement;
  if (cell.status === "missed") return "rgba(220, 38, 38, 0.28)";
  if (cell.status === "partial") {
    if (cell.rate < 0.34) return "rgba(34, 163, 122, 0.28)";
    if (cell.rate < 0.67) return "rgba(34, 163, 122, 0.5)";
    return "rgba(34, 163, 122, 0.7)";
  }
  if (cell.status === "done" || (cell.status === "today" && cell.rate >= 1)) {
    return avoid ? "#0D9488" : theme.success;
  }
  if (cell.status === "today" && cell.rate > 0) {
    return avoid ? "rgba(13, 148, 136, 0.45)" : "rgba(34, 163, 122, 0.45)";
  }
  return theme.background;
}

export function HabitMonthHeatmap({
  map,
  avoid = false,
  onPrev,
  onNext,
  canGoNext = true,
  title,
}: {
  map: MonthHeatmap;
  avoid?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  canGoNext?: boolean;
  title?: string;
}) {
  const theme = useTheme();
  const headers = monthHeatmapHeaders();

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        {onPrev ? (
          <Pressable onPress={onPrev} hitSlop={8}>
            <ThemedText type="smallBold">‹</ThemedText>
          </Pressable>
        ) : (
          <View style={styles.navSlot} />
        )}
        <View style={styles.title}>
          <ThemedText type="smallBold">
            {title ?? monthLabel(map.year, map.month)}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {heatmapRateLabel(map)}
          </ThemedText>
        </View>
        {onNext ? (
          <Pressable
            onPress={canGoNext ? onNext : undefined}
            hitSlop={8}
            style={!canGoNext ? styles.disabled : undefined}
          >
            <ThemedText type="smallBold">›</ThemedText>
          </Pressable>
        ) : (
          <View style={styles.navSlot} />
        )}
      </View>
      <View style={styles.grid}>
        {headers.map((label, index) => (
          <ThemedText
            key={`${label}-${index}`}
            type="small"
            themeColor="textSecondary"
            style={styles.header}
          >
            {label}
          </ThemedText>
        ))}
        {map.cells.map((cell, index) =>
          cell ? (
            <View
              key={cell.date}
              style={[
                styles.cell,
                {
                  backgroundColor: cellColor(cell, avoid, theme),
                  borderColor:
                    cell.status === "today" ? theme.primary : "transparent",
                },
              ]}
            />
          ) : (
            <View key={`pad-${index}`} style={styles.cell} />
          )
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  title: { flex: 1, alignItems: "center", gap: 2 },
  navSlot: { width: 18 },
  disabled: { opacity: 0.3 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  header: {
    width: "14.28%",
    textAlign: "center",
    marginBottom: 6,
  },
  cell: {
    width: "14.28%",
    aspectRatio: 1,
    borderRadius: 4,
    borderWidth: 1.5,
    marginBottom: 4,
  },
});
