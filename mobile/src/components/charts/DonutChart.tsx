import { useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { ThemedText } from "@/components/themed-text";
import { Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { hexAlpha } from "@/lib/color";
import { formatBRL } from "@/lib/currency";

export type DonutSlice = {
  label: string;
  value: number;
  color: string | null;
};

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function donutPath(
  cx: number,
  cy: number,
  rInner: number,
  rOuter: number,
  start: number,
  end: number
): string {
  const large = end - start > 180 ? 1 : 0;
  const p0 = polar(cx, cy, rOuter, start);
  const p1 = polar(cx, cy, rOuter, end);
  const p2 = polar(cx, cy, rInner, end);
  const p3 = polar(cx, cy, rInner, start);
  return `M ${p0.x} ${p0.y} A ${rOuter} ${rOuter} 0 ${large} 1 ${p1.x} ${p1.y} L ${p2.x} ${p2.y} A ${rInner} ${rInner} 0 ${large} 0 ${p3.x} ${p3.y} Z`;
}

export function DonutChart({
  slices,
  holeLabel,
  background,
  selectedLabel,
  selectedRowBg,
  onSlicePress,
}: {
  slices: DonutSlice[];
  holeLabel?: string;
  background: string;
  selectedLabel?: string | null;
  selectedRowBg?: string;
  onSlicePress?: (slice: DonutSlice) => void;
}) {
  const theme = useTheme();
  const fallback = theme.mutedForeground;
  const size = 196;
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = 86;
  const rInner = 52;

  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0);
  const selected = slices.find((s) => s.label === selectedLabel) ?? null;
  const paths = useMemo(() => {
    if (total <= 0) return [];
    let cursor = 0;
    return slices
      .filter((s) => s.value > 0)
      .map((s) => {
        const sweep = (s.value / total) * 360;
        const start = cursor;
        const end = cursor + sweep;
        cursor = end;
        return { ...s, start, end, sweep };
      });
  }, [slices, total]);

  const holeTitle = selected?.label ?? holeLabel ?? formatBRL(total);

  return (
    <View style={styles.wrap}>
      <View style={styles.ring}>
        <Svg width={size} height={size}>
          {total <= 0 ? (
            <Circle
              cx={cx}
              cy={cy}
              r={(rOuter + rInner) / 2}
              stroke={fallback}
              strokeWidth={rOuter - rInner}
              fill="none"
              opacity={0.35}
            />
          ) : paths.length === 1 && paths[0].sweep >= 359.9 ? (
            <>
              <Circle
                cx={cx}
                cy={cy}
                r={rOuter}
                fill={paths[0].color || fallback}
                onPress={() => onSlicePress?.(paths[0])}
              />
              <Circle cx={cx} cy={cy} r={rInner} fill={background} />
            </>
          ) : (
            paths.map((p) => {
              const active = !selectedLabel || p.label === selectedLabel;
              return (
                <Path
                  key={`${p.label}-${p.start}`}
                  d={donutPath(
                    cx,
                    cy,
                    rInner,
                    p.label === selectedLabel ? rOuter + 4 : rOuter,
                    p.start,
                    Math.min(p.end, 359.999)
                  )}
                  fill={p.color || fallback}
                  opacity={active ? 1 : 0.35}
                  onPress={() => onSlicePress?.(p)}
                />
              );
            })
          )}
        </Svg>
        <View style={styles.hole} pointerEvents="none">
          <ThemedText
            type="smallBold"
            style={styles.holeTitle}
            numberOfLines={2}
          >
            {holeTitle}
          </ThemedText>
          {selected ? (
            <ThemedText type="small" themeColor="mutedForeground">
              {formatBRL(selected.value)}
            </ThemedText>
          ) : null}
        </View>
      </View>
      <View style={styles.legend}>
        {slices.length === 0 ? (
          <ThemedText themeColor="mutedForeground">
            Sem dados neste recorte.
          </ThemedText>
        ) : (
          slices.map((s) => {
            const active = s.label === selectedLabel;
            return (
              <Pressable
                key={s.label}
                onPress={() => onSlicePress?.(s)}
                style={[
                  styles.legendRow,
                  active && selectedRowBg
                    ? { backgroundColor: selectedRowBg }
                    : active && { backgroundColor: hexAlpha(theme.primary, 0.12) },
                ]}
              >
                <View
                  style={[
                    styles.swatch,
                    { backgroundColor: s.color || fallback },
                  ]}
                />
                <ThemedText style={styles.legendLabel} numberOfLines={1}>
                  {s.label}
                </ThemedText>
                <ThemedText type="smallBold">{formatBRL(s.value)}</ThemedText>
              </Pressable>
            );
          })
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.three },
  ring: { alignItems: "center", justifyContent: "center" },
  hole: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 36,
  },
  holeTitle: { textAlign: "center" },
  legend: { gap: 4 },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: Radius.md,
  },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  legendLabel: { flex: 1 },
});
