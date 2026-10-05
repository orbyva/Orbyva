import { Pressable, StyleSheet, View } from "react-native";
import Svg, { Line } from "react-native-svg";

import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import {
  heatmapRateLabel,
  monthHeatmapHeaders,
  monthLabel,
} from "@/domain/habits/heatmap";
import { habitAccent, heatCellColor, missedTint } from "@/domain/habits/habitColors";
import { TypeScale } from "@/domain/ui/typography";
import { useModuleColors, useTheme } from "@/hooks/use-theme";
import { hexAlpha } from "@/lib/color";
import type { HabitHeatCell, MonthHeatmap } from "@/types/habits";

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    rows.push(items.slice(i, i + size));
  }
  return rows;
}

function HeatCell({
  cell,
  accent,
}: {
  cell: HabitHeatCell | null;
  accent: string;
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
          backgroundColor: heatCellColor(cell, accent, theme),
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
            stroke={missedTint(theme, 0.45)}
            strokeWidth="1.5"
          />
          <Line
            x1="-4"
            y1="12"
            x2="12"
            y2="-4"
            stroke={missedTint(theme, 0.35)}
            strokeWidth="1.5"
          />
          <Line
            x1="6"
            y1="22"
            x2="22"
            y2="6"
            stroke={missedTint(theme, 0.35)}
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
  const theme = useTheme();
  return (
    <View style={[styles.swatch, { backgroundColor: color }]}>
      {striped ? (
        <Svg width="100%" height="100%" viewBox="0 0 10 10">
          <Line
            x1="0"
            y1="10"
            x2="10"
            y2="0"
            stroke={missedTint(theme, 0.55)}
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
  const accent = habitAccent(avoid, useModuleColors().life, theme);
  const headers = monthHeatmapHeaders();
  const rows = chunk(map.cells, 7);

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <View style={styles.title}>
          {title ? <ThemedText type="smallBold">{title}</ThemedText> : null}
          <ThemedText type="small" themeColor="mutedForeground">
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
              themeColor="mutedForeground"
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
                accent={accent}
              />
            ))}
          </View>
        ))}
      </View>
      {showLegend ? (
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <Swatch color={accent} />
            <ThemedText type="small" themeColor="mutedForeground">
              Feito
            </ThemedText>
          </View>
          <View style={styles.legendItem}>
            <Swatch color={hexAlpha(accent, 0.45)} />
            <ThemedText type="small" themeColor="mutedForeground">
              Parcial
            </ThemedText>
          </View>
          <View style={styles.legendItem}>
            <Swatch color={missedTint(theme, 0.16)} striped />
            <ThemedText type="small" themeColor="mutedForeground">
              Falhou
            </ThemedText>
          </View>
          <View style={styles.legendItem}>
            <Swatch color={theme.border} />
            <ThemedText type="small" themeColor="mutedForeground">
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
    ...TypeScale.nano,
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
