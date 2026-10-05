import { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, { FadeInDown, LinearTransition } from "react-native-reanimated";
import Svg, { Rect, Text as SvgText } from "react-native-svg";
import * as Haptics from "expo-haptics";

import { fetchAvulsoLedgerInRange } from "@/api/finance/transactions";
import { ThemedText } from "@/components/themed-text";
import { Input } from "@/components/ui";
import { Radius, Spacing } from "@/constants/theme";
import { netTone } from "@/domain/ui/semanticTone";
import { useTheme } from "@/hooks/use-theme";
import { formatBRL, formatMoneyInput, moneyFromDigits } from "@/lib/currency";
import { getErrorMessage } from "@/lib/errors";
import {
  buildBalanceSeriesWindow,
  buildPurchaseSimulation,
  futureMonthsForSimulation,
  indexAvulsoLedgerByYm,
  shiftYearMonth,
  simulationAmountForYm,
  type YearMonth,
} from "@/domain/recurring/projection";
import type { Recurring } from "@/types/recurring";

function monthTitle(ym: YearMonth): string {
  const label = new Date(ym.year, ym.month - 1).toLocaleString("pt-BR", {
    month: "short",
    year: "numeric",
  });
  return label.replace(".", "");
}

function sameYm(a: YearMonth, b: YearMonth): boolean {
  return a.year === b.year && a.month === b.month;
}

export function RecurringProjection({
  items,
  year,
  month,
  onSelectMonth,
}: {
  items: Recurring[];
  year?: number;
  month?: number;
  onSelectMonth?: (ym: YearMonth) => void;
}) {
  const theme = useTheme();
  const { width: screenW } = useWindowDimensions();
  const now = useMemo(() => new Date(), []);
  const initial: YearMonth = {
    year: year ?? now.getFullYear(),
    month: month ?? now.getMonth() + 1,
  };
  const [anchor, setAnchor] = useState<YearMonth>(initial);
  const [focused, setFocused] = useState<YearMonth>(initial);
  const [simOpen, setSimOpen] = useState(false);
  const [simDigits, setSimDigits] = useState("");
  const [simCount, setSimCount] = useState("12");
  const [ledgerByYm, setLedgerByYm] = useState<
    Record<string, { receita: number; despesa: number }>
  >({});
  const [error, setError] = useState<string | null>(null);

  const simTotal = moneyFromDigits(simDigits);
  const simN = Math.max(1, Math.min(48, Number(simCount) || 12));
  const simulation = useMemo(() => {
    if (!simOpen || simTotal == null || simTotal <= 0) return null;
    return buildPurchaseSimulation({
      total: simTotal,
      installmentCount: simN,
      start: focused,
    });
  }, [simOpen, simTotal, simN, focused]);

  const future = useMemo(
    () => futureMonthsForSimulation(anchor, simulation, 5),
    [anchor, simulation]
  );

  useEffect(() => {
    let cancelled = false;
    const from = shiftYearMonth(anchor, -1);
    const to = shiftYearMonth(anchor, future);
    const lastDay = new Date(to.year, to.month, 0).getDate();
    const start = `${from.year}-${String(from.month).padStart(2, "0")}-01T00:00:00.000Z`;
    const end = `${to.year}-${String(to.month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}T23:59:59.999Z`;
    void fetchAvulsoLedgerInRange(start, end)
      .then((txs) => {
        if (cancelled) return;
        setLedgerByYm((prev) => ({
          ...prev,
          ...indexAvulsoLedgerByYm(txs),
        }));
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(getErrorMessage(err, "Não foi possível carregar a projeção."));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [future, anchor]);

  const series = useMemo(
    () =>
      buildBalanceSeriesWindow(items, anchor, ledgerByYm, {
        past: 1,
        future,
      }).map((point) => {
        const extra = simulationAmountForYm(simulation, point.year, point.month);
        const payTotal = point.payTotal + extra;
        return {
          ...point,
          payTotal,
          net: point.receiveTotal - payTotal,
          sim: extra,
        };
      }),
    [items, ledgerByYm, simulation, anchor, future]
  );

  function selectMonth(next: YearMonth, recenter: boolean) {
    setFocused(next);
    onSelectMonth?.(next);
    if (recenter) setAnchor(next);
    void Haptics.selectionAsync().catch(() => undefined);
  }

  const focusedPoint =
    series.find((point) => sameYm(point, focused)) ??
    series.find((point) => sameYm(point, anchor)) ??
    null;
  const width = Math.max(280, screenW - Spacing.four * 2);
  const height = 140;
  const maxAbs = Math.max(1, ...series.map((p) => Math.abs(p.net)));
  const barW = series.length > 0 ? (width - 16) / series.length : 0;

  return (
    <View style={styles.wrap}>
      <View style={styles.monthRow}>
        <Pressable
          onPress={() => selectMonth(shiftYearMonth(anchor, -1), true)}
          style={[styles.monthBtn, { backgroundColor: theme.muted }]}
        >
          <ThemedText type="smallBold">‹</ThemedText>
        </Pressable>
        <ThemedText type="smallBold" style={styles.monthTitle}>
          Projeção · {monthTitle(focused)}
        </ThemedText>
        <Pressable
          onPress={() => selectMonth(shiftYearMonth(anchor, 1), true)}
          style={[styles.monthBtn, { backgroundColor: theme.muted }]}
        >
          <ThemedText type="smallBold">›</ThemedText>
        </Pressable>
      </View>

      {error ? (
        <ThemedText type="small" themeColor="destructive">
          {error}
        </ThemedText>
      ) : null}

      <View>
        <ThemedText type="small" themeColor="mutedForeground">
          Toque uma barra para focar o mês e filtrar a lista.
        </ThemedText>
        <View style={[styles.chart, { width, height }]}>
          <Svg width={width} height={height}>
            <Rect
              x={0}
              y={height / 2}
              width={width}
              height={1}
              fill={theme.border}
            />
            {series.map((point, i) => {
              const selected = sameYm(point, focused);
              const h = (Math.abs(point.net) / maxAbs) * (height / 2 - 16);
              const x = 8 + i * barW + 2;
              const y = point.net >= 0 ? height / 2 - h : height / 2;
              return (
                <Rect
                  key={point.ym}
                  x={x}
                  y={y}
                  width={Math.max(4, barW - 6)}
                  height={Math.max(2, h)}
                  rx={2}
                  fill={theme[netTone(point.net)]}
                  fillOpacity={selected ? 1 : 0.38}
                />
              );
            })}
            {series.map((point, i) =>
              i % 2 === 0 ? (
                <SvgText
                  key={`l-${point.ym}`}
                  x={8 + i * barW + barW / 2}
                  y={height - 4}
                  fontSize={9}
                  fill={theme.mutedForeground}
                  fontWeight={sameYm(point, focused) ? "700" : "400"}
                  textAnchor="middle"
                >
                  {String(point.month).padStart(2, "0")}
                </SvgText>
              ) : null
            )}
          </Svg>
          {series.map((point, i) => (
            <Pressable
              key={`hit-${point.ym}`}
              accessibilityRole="button"
              accessibilityLabel={`${monthTitle(point)}, saldo ${formatBRL(point.net)}`}
              onPress={() =>
                selectMonth({ year: point.year, month: point.month }, false)
              }
              style={{
                position: "absolute",
                left: 8 + i * barW,
                top: 0,
                width: Math.max(24, barW),
                height,
              }}
            />
          ))}
        </View>
        {focusedPoint ? (
          <Animated.View
            key={`${focusedPoint.year}-${focusedPoint.month}`}
            entering={FadeInDown.duration(220)}
            layout={LinearTransition.duration(180)}
            style={[styles.focus, { backgroundColor: theme.muted }]}
          >
            <ThemedText type="smallBold">{monthTitle(focusedPoint)}</ThemedText>
            <ThemedText type="small" themeColor="mutedForeground">
              +{formatBRL(focusedPoint.receiveTotal)} · −
              {formatBRL(focusedPoint.payTotal)}
            </ThemedText>
            <ThemedText
              type="smallBold"
              themeColor={netTone(focusedPoint.net)}
            >
              {formatBRL(focusedPoint.net)}
            </ThemedText>
          </Animated.View>
        ) : null}
      </View>

      <View style={styles.list}>
        {series.map((point) => {
          const selected = sameYm(point, focused);
          return (
            <Pressable
              key={point.ym}
              onPress={() =>
                selectMonth({ year: point.year, month: point.month }, false)
              }
              style={[
                styles.row,
                { backgroundColor: theme.muted },
                selected && {
                  borderWidth: 1,
                  borderColor: theme.primary,
                },
              ]}
            >
              <ThemedText type="smallBold" style={styles.rowMonth}>
                {monthTitle(point)}
              </ThemedText>
              <ThemedText type="small" themeColor="mutedForeground">
                +{formatBRL(point.receiveTotal)}
              </ThemedText>
              <ThemedText type="small" themeColor="mutedForeground">
                −{formatBRL(point.payTotal)}
              </ThemedText>
              <ThemedText
                type="smallBold"
                themeColor={netTone(point.net)}
              >
                {formatBRL(point.net)}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        onPress={() => setSimOpen((cur) => !cur)}
        style={[styles.simToggle, { backgroundColor: theme.muted }]}
      >
        <ThemedText type="smallBold">
          {simOpen ? "Ocultar simulação" : "Simular compra parcelada"}
        </ThemedText>
      </Pressable>

      {simOpen ? (
        <View style={[styles.sim, { backgroundColor: theme.muted }]}>
          <ThemedText type="small" themeColor="mutedForeground">
            Não grava nada — só soma as parcelas no gráfico.
          </ThemedText>
          <Input
            keyboardType="number-pad"
            placeholder="Valor total"
            value={simTotal != null ? formatMoneyInput(simTotal) : ""}
            onChangeText={(raw) => setSimDigits(raw.replace(/\D/g, ""))}
          />
          <Input
            keyboardType="number-pad"
            placeholder="Parcelas"
            value={simCount}
            onChangeText={setSimCount}
          />
          {simulation ? (
            <ThemedText type="small" themeColor="mutedForeground">
              {simulation.installmentCount}× de{" "}
              {formatBRL(simulation.installmentValue)} a partir de{" "}
              {monthTitle(simulation.start)}
            </ThemedText>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.three },
  monthRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  monthBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  monthTitle: { flex: 1, textAlign: "center" },
  chart: { marginTop: 8 },
  list: { gap: 8 },
  row: {
    borderRadius: Radius.xl,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rowMonth: { flex: 1 },
  focus: {
    marginTop: 10,
    borderRadius: Radius.xl,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  simToggle: {
    borderRadius: Radius.xl,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  sim: { borderRadius: Radius.xl, padding: 14, gap: 10 },
});
