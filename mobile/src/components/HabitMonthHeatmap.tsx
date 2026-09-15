import { Pressable, StyleSheet, View } from "react-native";
import Svg, { Line } from "react-native-svg";

import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import {
  heatmapRateLabel,
  monthHeatmapHeaders,
  monthLabel,
} from "@/domain/habits/heatmap";
import { useTheme } from "@/hooks/use-theme";
import type { HabitHeatCell, MonthHeatmap } from "@/types/habits";

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    rows.push(items.slice(i, i + size));
  }
  return rows;
}

function cellColor(
  cell: HabitHeatCell,
  avoid: boolean,
  theme: ReturnType<typeof useTheme>
): string {
  if (cell.status === "future") return theme.backgroundSelected;
  if (cell.status === "empty") return theme.backgroundElement;
  if (cell.status === "missed") return "rgba(225, 29, 72, 0.16)";
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

function HeatCell({
  cell,
  avoid,
}: {
  cell: HabitHeatCell | null;
  avoid: boolean;
}) {
  const theme = useTheme();
  if (!cell) return <View style={styles.cell} />;
  const missed = cell.status === "missed";
  const today = cell.status === "today";
  return (
    <View
      style={[
        styles.cell,
        {
          backgroundColor: cellColor(cell, avoid, theme),
          borderColor: today ? theme.primary : "transparent",
        },
      ]}
    >
      {missed ? (
        <Svg width="100%" height="100%" viewBox="0 0 18 18">
          <Line
            x1="0"
            y1="18"
            x2="18"
            y2="0"
            stroke="rgba(225, 29, 72, 0.45)"
            strokeWidth="1.5"
          />
          <Line
            x1="-4"
            y1="12"
            x2="12"
            y2="-4"
            stroke="rgba(225, 29, 72, 0.35)"
            strokeWidth="1.5"
          />
          <Line
            x1="6"
            y1="22"
            x2="22"
            y2="6"
            stroke="rgba(225, 29, 72, 0.35)"
            strokeWidth="1.5"
          />
        </Svg>
      ) : null}
    </View>
  );
}

function Swatch({
  color,
  striped,
}: {
  color: string;
  striped?: boolean;
}) {
  return (
    <View style={[styles.swatch, { backgroundColor: color }]}>
      {striped ? (
        <Svg width="100%" height="100%" viewBox="0 0 10 10">
          <Line
            x1="0"
            y1="10"
            x2="10"
            y2="0"
            stroke="rgba(225, 29, 72, 0.55)"
            strokeWidth="1.2"
          />
        </Svg>
      ) : null}
    </View>
  );
}

export function HabitMonthHeatmap({
  map,
  avoid = false,
  onPrev,
  onNext,
  canGoNext = true,
  title,
  showLegend = true,
}: {
  map: MonthHeatmap;
  avoid?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  canGoNext?: boolean;
  title?: string;
  showLegend?: boolean;
}) {
  const theme = useTheme();
  const headers = monthHeatmapHeaders();
  const rows = chunk(map.cells, 7);

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <View style={styles.title}>
          {title ? <ThemedText type="smallBold">{title}</ThemedText> : null}
          <ThemedText type="small" themeColor="textSecondary">
            {onPrev || onNext ? `${monthLabel(map.year, map.month)} · ` : ""}
            {heatmapRateLabel(map)}
          </ThemedText>
        </View>
        {onPrev || onNext ? (
          <View style={styles.nav}>
            <Pressable onPress={onPrev} hitSlop={8} disabled={!onPrev}>
              <ThemedText type="smallBold">‹</ThemedText>
            </Pressable>
            <Pressable
              onPress={canGoNext ? onNext : undefined}
              hitSlop={8}
              style={!canGoNext ? styles.disabled : undefined}
            >
              <ThemedText type="smallBold">›</ThemedText>
            </Pressable>
          </View>
        ) : null}
      </View>
      <View style={styles.grid}>
        <View style={styles.week}>
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
        </View>
        {rows.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.week}>
            {row.map((cell, cellIndex) => (
              <HeatCell
                key={cell?.date ?? `pad-${rowIndex}-${cellIndex}`}
                cell={cell}
                avoid={avoid}
              />
            ))}
          </View>
        ))}
      </View>
      {showLegend ? (
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <Swatch color={avoid ? "#0D9488" : theme.success} />
            <ThemedText type="small" themeColor="textSecondary">
              Feito
            </ThemedText>
          </View>
          <View style={styles.legendItem}>
            <Swatch color="rgba(34, 163, 122, 0.45)" />
            <ThemedText type="small" themeColor="textSecondary">
              Parcial
            </ThemedText>
          </View>
          <View style={styles.legendItem}>
            <Swatch color="rgba(225, 29, 72, 0.16)" striped />
            <ThemedText type="small" themeColor="textSecondary">
              Falhou
            </ThemedText>
          </View>
          <View style={styles.legendItem}>
            <Swatch color={theme.backgroundSelected} />
            <ThemedText type="small" themeColor="textSecondary">
              Futuro
            </ThemedText>
          </View>
        </View>
      ) : null}
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
  title: { flex: 1, gap: 2 },
  nav: { flexDirection: "row", gap: 12, paddingHorizontal: 4 },
  disabled: { opacity: 0.3 },
  grid: { gap: 4, alignSelf: "center", width: "100%", maxWidth: 280 },
  week: { flexDirection: "row", gap: 4 },
  header: {
    flex: 1,
    textAlign: "center",
    fontSize: 10,
    lineHeight: 12,
  },
  cell: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 3,
    borderWidth: 1.5,
    overflow: "hidden",
  },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 4,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: 2,
    overflow: "hidden",
  },
});
