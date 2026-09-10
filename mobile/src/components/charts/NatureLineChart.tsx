import { useMemo, useState } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import Svg, { Circle, Line, Polyline, Text as SvgText } from "react-native-svg";

import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { monthShortLabel } from "@/domain/finance/insights";
import { formatBRL } from "@/lib/currency";
import type { ValueByNatureYearMonth } from "@/types/finance";

import { CHART_EXPENSE, CHART_INCOME } from "./DonutChart";

export function NatureLineChart({
  series,
  textColor,
}: {
  series: ValueByNatureYearMonth[];
  textColor: string;
}) {
  const { width: screenW } = useWindowDimensions();
  const width = Math.max(280, screenW - Spacing.four * 2);
  const height = 200;
  const pad = { top: 16, right: 12, bottom: 28, left: 8 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const points = useMemo(() => {
    const sorted = [...series]
      .sort((a, b) => a.year - b.year || a.month - b.month)
      .slice(-12);
    const max = Math.max(
      1,
      ...sorted.flatMap((r) => [r.receita_total, r.despesa_total])
    );
    const n = Math.max(sorted.length - 1, 1);
    return sorted.map((row, i) => {
      const x = pad.left + (sorted.length === 1 ? innerW / 2 : (i / n) * innerW);
      const yReceita =
        pad.top + innerH - (row.receita_total / max) * innerH;
      const yDespesa =
        pad.top + innerH - (row.despesa_total / max) * innerH;
      const label = monthShortLabel(row.month);
      const key = `${row.year}-${row.month}`;
      return { x, yReceita, yDespesa, label, row, key };
    });
  }, [series, innerH, innerW]);

  const selected = points.find((p) => p.key === selectedKey) ?? null;
  const receitaLine = points.map((p) => `${p.x},${p.yReceita}`).join(" ");
  const despesaLine = points.map((p) => `${p.x},${p.yDespesa}`).join(" ");

  if (points.length === 0) {
    return (
      <ThemedText themeColor="textSecondary">
        Sem histórico de meses ainda.
      </ThemedText>
    );
  }

  return (
    <View style={styles.wrap}>
      <Svg width={width} height={height}>
        <Line
          x1={pad.left}
          y1={pad.top + innerH}
          x2={pad.left + innerW}
          y2={pad.top + innerH}
          stroke={textColor}
          strokeOpacity={0.15}
        />
        <Polyline
          points={receitaLine}
          fill="none"
          stroke={CHART_INCOME}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <Polyline
          points={despesaLine}
          fill="none"
          stroke={CHART_EXPENSE}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {points.map((p) => (
          <Circle
            key={`r-${p.key}`}
            cx={p.x}
            cy={p.yReceita}
            r={selected?.key === p.key ? 5 : 3}
            fill={CHART_INCOME}
            onPress={() =>
              setSelectedKey((cur) => (cur === p.key ? null : p.key))
            }
          />
        ))}
        {points.map((p) => (
          <Circle
            key={`d-${p.key}`}
            cx={p.x}
            cy={p.yDespesa}
            r={selected?.key === p.key ? 5 : 3}
            fill={CHART_EXPENSE}
            onPress={() =>
              setSelectedKey((cur) => (cur === p.key ? null : p.key))
            }
          />
        ))}
        {points.map((p) => (
          <Circle
            key={`hit-${p.key}`}
            cx={p.x}
            cy={(p.yReceita + p.yDespesa) / 2}
            r={18}
            fill="transparent"
            onPress={() =>
              setSelectedKey((cur) => (cur === p.key ? null : p.key))
            }
          />
        ))}
        {points.map((p, i) =>
          i % Math.ceil(points.length / 6) === 0 || i === points.length - 1 ? (
            <SvgText
              key={`lbl-${p.key}`}
              x={p.x}
              y={height - 8}
              fill={textColor}
              fontSize={10}
              textAnchor="middle"
              opacity={0.7}
            >
              {p.label}
            </SvgText>
          ) : null
        )}
      </Svg>
      {selected ? (
        <ThemedText type="small">
          {selected.label} {selected.row.year}
          {" · "}
          Receita {formatBRL(selected.row.receita_total)}
          {" · "}
          Despesa {formatBRL(selected.row.despesa_total)}
        </ThemedText>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          Toque num mês para ver os valores.
        </ThemedText>
      )}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: CHART_INCOME }]} />
          <ThemedText type="small">Receita</ThemedText>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: CHART_EXPENSE }]} />
          <ThemedText type="small">Despesa</ThemedText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  legend: { flexDirection: "row", gap: Spacing.three },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
