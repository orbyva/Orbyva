import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, { FadeIn, FadeInDown, LinearTransition } from "react-native-reanimated";
import Svg, { Line, Rect, Text as SvgText } from "react-native-svg";
import * as Haptics from "expo-haptics";

import { fetchAvulsoLedgerInRange } from "@/api/finance/transactions";
import { ThemedText } from "@/components/themed-text";
import { Input } from "@/components/ui";
import { Radius, Spacing } from "@/constants/theme";
import {
  layoutProjectionBars,
  monthsTurnedNegative,
  simulationImpact,
  type SimulatedPoint,
} from "@/domain/recurring/projectionChart";
import {
  buildBalanceSeriesWindow,
  buildPurchaseSimulation,
  futureMonthsForSimulation,
  indexAvulsoLedgerByYm,
  shiftYearMonth,
  simulationAmountForYm,
  type YearMonth,
} from "@/domain/recurring/projection";
import { netTone } from "@/domain/ui/semanticTone";
import { useTheme } from "@/hooks/use-theme";
import { formatBRL, formatMoneyInput, moneyFromDigits } from "@/lib/currency";
import { hexAlpha } from "@/lib/color";
import { getErrorMessage } from "@/lib/errors";
import type { Recurring } from "@/types/recurring";

const MAX_INSTALLMENTS = 120;
const QUICK_COUNTS = [1, 3, 6, 10, 12, 24];
const SLOT_WIDTH = 46;
const PLOT_HEIGHT = 150;
const LABEL_HEIGHT = 22;

function monthTitle(ym: YearMonth): string {
  return new Date(ym.year, ym.month - 1)
    .toLocaleString("pt-BR", { month: "short", year: "numeric" })
    .replace(".", "");
}

function shortMonth(ym: YearMonth): string {
  const m = new Date(ym.year, ym.month - 1).toLocaleString("pt-BR", { month: "short" }).replace(".", "");
  return `${m}/${String(ym.year).slice(2)}`;
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
  const today: YearMonth = { year: now.getFullYear(), month: now.getMonth() + 1 };
  const initial: YearMonth = { year: year ?? today.year, month: month ?? today.month };
  const [anchor, setAnchor] = useState<YearMonth>(initial);
  const [focused, setFocused] = useState<YearMonth>(initial);
  const [simOpen, setSimOpen] = useState(false);
  const [simDigits, setSimDigits] = useState("");
  const [simCount, setSimCount] = useState("12");
  const [simStart, setSimStart] = useState<YearMonth>(initial);
  const [ledgerByYm, setLedgerByYm] = useState<Record<string, { receita: number; despesa: number }>>({});
  const [error, setError] = useState<string | null>(null);
  const chartScroll = useRef<ScrollView>(null);

  const sim = theme.warning;
  const simTotal = moneyFromDigits(simDigits);
  const simN = Math.max(1, Math.min(MAX_INSTALLMENTS, Number(simCount) || 1));
  const simulation = useMemo(() => {
    if (!simOpen || simTotal == null || simTotal <= 0) return null;
    return buildPurchaseSimulation({ total: simTotal, installmentCount: simN, start: simStart });
  }, [simOpen, simTotal, simN, simStart]);

  const future = useMemo(() => futureMonthsForSimulation(anchor, simulation, 5), [anchor, simulation]);

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
        setLedgerByYm((prev) => ({ ...prev, ...indexAvulsoLedgerByYm(txs) }));
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err, "Não foi possível carregar a projeção."));
      });
    return () => {
      cancelled = true;
    };
  }, [future, anchor]);

  const series: SimulatedPoint[] = useMemo(
    () =>
      buildBalanceSeriesWindow(items, anchor, ledgerByYm, { past: 1, future }).map((point) => ({
        ym: point.ym,
        year: point.year,
        month: point.month,
        receiveTotal: point.receiveTotal,
        payBase: point.payTotal,
        sim: simulationAmountForYm(simulation, point.year, point.month),
      })),
    [items, ledgerByYm, simulation, anchor, future]
  );

  const chartWidthAvailable = Math.max(280, screenW - Spacing.four * 2);
  const slotWidth = Math.max(SLOT_WIDTH, chartWidthAvailable / Math.max(1, series.length));
  const layout = useMemo(
    () => layoutProjectionBars(series, { slotWidth, plotHeight: PLOT_HEIGHT }),
    [series, slotWidth]
  );
  const focusedIndex = series.findIndex((point) => sameYm(point, focused));
  const focusedPoint = focusedIndex >= 0 ? series[focusedIndex] : null;
  const impact = focusedPoint ? simulationImpact(focusedPoint) : null;
  const redMonths = useMemo(() => (simulation ? monthsTurnedNegative(series) : []), [simulation, series]);

  useEffect(() => {
    if (focusedIndex < 0) return;
    const x = Math.max(0, focusedIndex * slotWidth - chartWidthAvailable / 2 + slotWidth / 2);
    chartScroll.current?.scrollTo({ x, animated: true });
  }, [focusedIndex, slotWidth, chartWidthAvailable]);

  function selectMonth(next: YearMonth, recenter: boolean) {
    setFocused(next);
    onSelectMonth?.(next);
    if (recenter) setAnchor(next);
    void Haptics.selectionAsync().catch(() => undefined);
  }

  function openSimulation() {
    setSimStart(focused);
    setSimOpen(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  }

  function clearSimulation() {
    setSimOpen(false);
    setSimDigits("");
    setSimCount("12");
  }

  const isToday = sameYm(focused, today);

  return (
    <View style={styles.wrap}>
      <View style={styles.monthRow}>
        <Pressable
          accessibilityLabel="Mês anterior"
          onPress={() => selectMonth(shiftYearMonth(focused, -1), true)}
          style={[styles.monthBtn, { backgroundColor: theme.muted }]}
        >
          <Ionicons name="chevron-back" size={18} color={theme.foreground} />
        </Pressable>
        <View style={styles.monthTitle}>
          <ThemedText type="smallBold">{monthTitle(focused)}</ThemedText>
          {!isToday ? (
            <Pressable hitSlop={6} onPress={() => selectMonth(today, true)}>
              <ThemedText type="small" style={{ color: theme.primary }}>
                Voltar para hoje
              </ThemedText>
            </Pressable>
          ) : null}
        </View>
        <Pressable
          accessibilityLabel="Próximo mês"
          onPress={() => selectMonth(shiftYearMonth(focused, 1), true)}
          style={[styles.monthBtn, { backgroundColor: theme.muted }]}
        >
          <Ionicons name="chevron-forward" size={18} color={theme.foreground} />
        </Pressable>
      </View>

      {error ? (
        <ThemedText type="small" themeColor="destructive">
          {error}
        </ThemedText>
      ) : null}

      {!simOpen ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Simular compra parcelada"
          onPress={openSimulation}
          style={({ pressed }) => [
            styles.simCta,
            {
              borderColor: hexAlpha(sim, 0.45),
              backgroundColor: hexAlpha(sim, pressed ? 0.18 : 0.1),
            },
          ]}
        >
          <View style={[styles.simCtaIcon, { backgroundColor: sim }]}>
            <Ionicons name="sparkles" size={18} color={theme.warningForeground} />
          </View>
          <View style={styles.flex}>
            <ThemedText type="smallBold" style={{ color: sim }}>
              Simular compra parcelada
            </ThemedText>
            <ThemedText type="small" themeColor="mutedForeground">
              Veja o impacto no saldo antes de comprar
            </ThemedText>
          </View>
          <Ionicons name="chevron-forward" size={18} color={sim} />
        </Pressable>
      ) : (
        <Animated.View
          entering={FadeInDown.duration(220)}
          layout={LinearTransition.duration(180)}
          style={[styles.simCard, { borderColor: hexAlpha(sim, 0.4), backgroundColor: hexAlpha(sim, 0.07) }]}
        >
          <View style={styles.simHead}>
            <View style={[styles.simCtaIcon, { backgroundColor: sim }]}>
              <Ionicons name="sparkles" size={16} color={theme.warningForeground} />
            </View>
            <View style={styles.flex}>
              <ThemedText type="smallBold">Simular compra</ThemedText>
              <ThemedText type="small" themeColor="mutedForeground">
                Não grava nada. As parcelas aparecem em laranja.
              </ThemedText>
            </View>
            <Pressable accessibilityLabel="Fechar simulação" hitSlop={8} onPress={clearSimulation}>
              <Ionicons name="close" size={20} color={theme.mutedForeground} />
            </Pressable>
          </View>

          <Input
            label="Valor total"
            keyboardType="number-pad"
            placeholder="R$ 0,00"
            value={simTotal != null ? formatMoneyInput(simTotal) : ""}
            onChangeText={(raw) => setSimDigits(raw.replace(/\D/g, ""))}
          />

          <View style={styles.field}>
            <ThemedText type="small" themeColor="mutedForeground">
              Parcelas
            </ThemedText>
            <View style={styles.countRow}>
              {QUICK_COUNTS.map((n) => {
                const active = simN === n;
                return (
                  <Pressable
                    key={n}
                    onPress={() => setSimCount(String(n))}
                    style={[
                      styles.countChip,
                      {
                        borderColor: active ? sim : theme.border,
                        backgroundColor: active ? sim : "transparent",
                      },
                    ]}
                  >
                    <ThemedText
                      type="smallBold"
                      style={{ color: active ? theme.warningForeground : theme.foreground }}
                    >
                      {n}×
                    </ThemedText>
                  </Pressable>
                );
              })}
              <Input
                keyboardType="number-pad"
                placeholder="Outro"
                value={QUICK_COUNTS.includes(simN) ? "" : simCount}
                onChangeText={(raw) => setSimCount(raw.replace(/\D/g, "").slice(0, 3))}
                style={styles.countInput}
              />
            </View>
          </View>

          <View style={styles.field}>
            <ThemedText type="small" themeColor="mutedForeground">
              1ª parcela em
            </ThemedText>
            <View style={styles.stepper}>
              <Pressable
                accessibilityLabel="Mês anterior da 1ª parcela"
                onPress={() => setSimStart((cur) => shiftYearMonth(cur, -1))}
                style={[styles.monthBtn, { backgroundColor: theme.muted }]}
              >
                <Ionicons name="chevron-back" size={16} color={theme.foreground} />
              </Pressable>
              <ThemedText type="smallBold" style={styles.stepperLabel}>
                {monthTitle(simStart)}
              </ThemedText>
              <Pressable
                accessibilityLabel="Próximo mês da 1ª parcela"
                onPress={() => setSimStart((cur) => shiftYearMonth(cur, 1))}
                style={[styles.monthBtn, { backgroundColor: theme.muted }]}
              >
                <Ionicons name="chevron-forward" size={16} color={theme.foreground} />
              </Pressable>
            </View>
          </View>

          {simulation ? (
            <Animated.View entering={FadeIn.duration(200)} style={[styles.simResult, { backgroundColor: hexAlpha(sim, 0.12) }]}>
              <ThemedText type="small" themeColor="mutedForeground">
                Parcela estimada
              </ThemedText>
              <ThemedText type="subtitle" style={{ color: sim }}>
                {simulation.installmentCount}× {formatBRL(simulation.installmentValue)}
              </ThemedText>
              <ThemedText type="small" themeColor="mutedForeground">
                De {monthTitle(simulation.start)} a {monthTitle(simulation.end)}
              </ThemedText>
              {impact && impact.sim > 0 ? (
                <ThemedText type="small">
                  Em {monthTitle(focused)}: +{formatBRL(impact.sim)} a pagar · saldo de{" "}
                  <ThemedText type="smallBold" themeColor={netTone(impact.netBefore)}>
                    {formatBRL(impact.netBefore)}
                  </ThemedText>{" "}
                  para{" "}
                  <ThemedText type="smallBold" themeColor={netTone(impact.netAfter)}>
                    {formatBRL(impact.netAfter)}
                  </ThemedText>
                </ThemedText>
              ) : (
                <ThemedText type="small" themeColor="mutedForeground">
                  Sem parcela em {monthTitle(focused)}; começa em {monthTitle(simulation.start)}.
                </ThemedText>
              )}
              {redMonths.length > 0 ? (
                <View style={[styles.alert, { backgroundColor: hexAlpha(theme.destructive, 0.1) }]}>
                  <Ionicons name="warning" size={16} color={theme.destructive} />
                  <ThemedText type="small" themeColor="destructive" style={styles.flex}>
                    A compra deixa {redMonths.length === 1 ? "1 mês" : `${redMonths.length} meses`} no
                    vermelho: {redMonths.map(shortMonth).join(", ")}
                  </ThemedText>
                </View>
              ) : (
                <View style={[styles.alert, { backgroundColor: hexAlpha(theme.success, 0.1) }]}>
                  <Ionicons name="checkmark-circle" size={16} color={theme.success} />
                  <ThemedText type="small" themeColor="success" style={styles.flex}>
                    Nenhum mês da janela fica no vermelho por causa da compra.
                  </ThemedText>
                </View>
              )}
            </Animated.View>
          ) : (
            <ThemedText type="small" themeColor="mutedForeground">
              Informe o valor total para ver o efeito nos meses seguintes.
            </ThemedText>
          )}
        </Animated.View>
      )}

      {focusedPoint && impact ? (
        <View style={styles.summary}>
          <SummaryCard
            title="Receitas"
            value={focusedPoint.receiveTotal}
            color={theme.success}
          />
          <SummaryCard
            title="Despesas"
            value={impact.payWithSim}
            color={theme.destructive}
            hint={impact.sim > 0 ? `+${formatBRL(impact.sim)} sim` : undefined}
            hintColor={sim}
          />
          <SummaryCard
            title="Saldo"
            value={impact.netAfter}
            color={theme[netTone(impact.netAfter)]}
            hint={impact.sim > 0 ? `antes ${formatBRL(impact.netBefore)}` : undefined}
          />
        </View>
      ) : null}

      <View style={[styles.chartCard, { borderColor: theme.border }]}>
        <View style={styles.legend}>
          <LegendDot color={theme.success} label="Receitas" />
          <LegendDot color={theme.destructive} label="Despesas" />
          {simulation ? <LegendDot color={sim} label="Simulação" /> : null}
        </View>
        <ScrollView ref={chartScroll} horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ width: layout.width, height: PLOT_HEIGHT + LABEL_HEIGHT }}>
            <Svg width={layout.width} height={PLOT_HEIGHT + LABEL_HEIGHT}>
              {focusedIndex >= 0 ? (
                <Rect
                  x={focusedIndex * slotWidth + 2}
                  y={0}
                  width={slotWidth - 4}
                  height={PLOT_HEIGHT + LABEL_HEIGHT}
                  rx={6}
                  fill={theme.muted}
                />
              ) : null}
              <Line x1={0} x2={layout.width} y1={PLOT_HEIGHT} y2={PLOT_HEIGHT} stroke={theme.border} strokeWidth={1} />
              {layout.slots.map((slot, i) => {
                const point = series[i];
                const selected = i === focusedIndex;
                const past = point.year * 12 + point.month < today.year * 12 + today.month;
                const opacity = selected ? 1 : past ? 0.4 : 0.75;
                const left = slot.x + (slotWidth - layout.barWidth * 2 - 3) / 2;
                return [
                  <Rect
                    key={`r-${slot.ym}`}
                    x={left}
                    y={slot.receive.y}
                    width={layout.barWidth}
                    height={Math.max(1, slot.receive.height)}
                    rx={2}
                    fill={theme.success}
                    fillOpacity={opacity}
                  />,
                  <Rect
                    key={`p-${slot.ym}`}
                    x={left + layout.barWidth + 3}
                    y={slot.pay.y}
                    width={layout.barWidth}
                    height={Math.max(1, slot.pay.height)}
                    rx={slot.sim ? 0 : 2}
                    fill={theme.destructive}
                    fillOpacity={opacity}
                  />,
                  slot.sim ? (
                    <Rect
                      key={`s-${slot.ym}`}
                      x={left + layout.barWidth + 3}
                      y={slot.sim.y}
                      width={layout.barWidth}
                      height={Math.max(2, slot.sim.height)}
                      rx={2}
                      fill={sim}
                      fillOpacity={selected ? 1 : 0.9}
                    />
                  ) : null,
                  <SvgText
                    key={`l-${slot.ym}`}
                    x={slot.x + slotWidth / 2}
                    y={PLOT_HEIGHT + 15}
                    fontSize={10}
                    fill={selected ? theme.foreground : theme.mutedForeground}
                    fontWeight={selected ? "700" : "400"}
                    textAnchor="middle"
                  >
                    {shortMonth(point)}
                  </SvgText>,
                ];
              })}
            </Svg>
            {series.map((point, i) => (
              <Pressable
                key={`hit-${point.ym}`}
                accessibilityRole="button"
                accessibilityLabel={`${monthTitle(point)}, saldo ${formatBRL(simulationImpact(point).netAfter)}`}
                onPress={() => selectMonth({ year: point.year, month: point.month }, false)}
                style={[styles.hit, { left: i * slotWidth, width: slotWidth, height: PLOT_HEIGHT + LABEL_HEIGHT }]}
              />
            ))}
          </View>
        </ScrollView>
        <ThemedText type="small" themeColor="mutedForeground">
          Toque num mês para ver os números e filtrar a lista.
        </ThemedText>
      </View>

      <View style={styles.list}>
        {series.map((point) => {
          const selected = sameYm(point, focused);
          const row = simulationImpact(point);
          return (
            <Pressable
              key={point.ym}
              onPress={() => selectMonth({ year: point.year, month: point.month }, false)}
              style={[
                styles.row,
                { backgroundColor: theme.muted },
                selected && { borderWidth: 1, borderColor: theme.primary },
                row.turnsNegative && { borderWidth: 1, borderColor: hexAlpha(theme.destructive, 0.5) },
              ]}
            >
              <View style={styles.rowMonth}>
                <ThemedText type="smallBold">{monthTitle(point)}</ThemedText>
                {row.sim > 0 ? (
                  <ThemedText type="small" style={{ color: sim }}>
                    +{formatBRL(row.sim)} simulação
                  </ThemedText>
                ) : null}
              </View>
              <View style={styles.rowNumbers}>
                <ThemedText type="small" themeColor="success">
                  +{formatBRL(point.receiveTotal)}
                </ThemedText>
                <ThemedText type="small" themeColor="destructive">
                  −{formatBRL(row.payWithSim)}
                </ThemedText>
              </View>
              <ThemedText type="smallBold" themeColor={netTone(row.netAfter)} style={styles.rowNet}>
                {formatBRL(row.netAfter)}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function SummaryCard({
  title,
  value,
  color,
  hint,
  hintColor,
}: {
  title: string;
  value: number;
  color: string;
  hint?: string;
  hintColor?: string;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.summaryCard, { backgroundColor: theme.muted, borderTopColor: color }]}>
      <ThemedText type="small" themeColor="mutedForeground">
        {title}
      </ThemedText>
      <ThemedText type="smallBold" style={{ color }} numberOfLines={1} adjustsFontSizeToFit>
        {formatBRL(value)}
      </ThemedText>
      {hint ? (
        <ThemedText type="small" style={{ color: hintColor ?? theme.mutedForeground }} numberOfLines={1}>
          {hint}
        </ThemedText>
      ) : null}
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <ThemedText type="small" themeColor="mutedForeground">
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wrap: { gap: Spacing.three },
  monthRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  monthBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  monthTitle: { flex: 1, alignItems: "center", gap: 2 },
  simCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: Radius.xl,
    padding: 12,
  },
  simCtaIcon: {
    width: 34,
    height: 34,
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  simCard: { borderWidth: 1, borderRadius: Radius.xl, padding: 14, gap: 12 },
  simHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  field: { gap: 6 },
  countRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  countChip: {
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  countInput: { minWidth: 72, flexGrow: 1 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 8 },
  stepperLabel: { flex: 1, textAlign: "center" },
  simResult: { borderRadius: Radius.lg, padding: 12, gap: 6 },
  alert: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: Radius.md, padding: 8 },
  summary: { flexDirection: "row", gap: 8 },
  summaryCard: {
    flex: 1,
    borderRadius: Radius.lg,
    borderTopWidth: 3,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  chartCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.xl, padding: 12, gap: 10 },
  legend: { flexDirection: "row", gap: 14, flexWrap: "wrap" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: Radius.sm / 2 },
  hit: { position: "absolute", top: 0 },
  list: { gap: 8 },
  row: {
    borderRadius: Radius.xl,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rowMonth: { flex: 1, gap: 2 },
  rowNumbers: { alignItems: "flex-end", gap: 2 },
  rowNet: { minWidth: 88, textAlign: "right" },
});
