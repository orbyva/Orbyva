import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import {
  fetchHabitsWithLogs,
  toggleHabitLog,
} from "@/api/habits/habits";
import { ChipBar } from "@/components/ChipBar";
import { HabitMonthHeatmap } from "@/components/HabitMonthHeatmap";
import { HabitWeekStrip } from "@/components/HabitWeekStrip";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner } from "@/components/ui/Banner";
import { Card } from "@/components/ui/Card";
import { Spacing } from "@/constants/theme";
import {
  calculateStreak,
  frequencyLabel,
  getTodayIso,
  getWeekProgress,
  getWeekStrip,
  habitLogsFromDate,
  isAvoidHabit,
  isCompletedToday,
} from "@/domain/habits";
import {
  buildHabitMonthHeatmap,
  buildOverallMonthHeatmap,
  shiftMonth,
} from "@/domain/habits/heatmap";
import { getHabitInsights } from "@/domain/habits/insights";
import { useAppShell } from "@/hooks/use-app-shell";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import type { Habit, HabitLog } from "@/types/habits";

export default function HabitsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { fail } = useFeedback();
  const { bottomInset } = useAppShell();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<HabitLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [view, setView] = useState<"today" | "month">("today");
  const now = new Date();
  const [monthCursor, setMonthCursor] = useState({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  });
  const hasLoaded = useRef(false);
  const today = getTodayIso();

  const load = useCallback(async () => {
    setError(null);
    const next = await fetchHabitsWithLogs({ fromDate: habitLogsFromDate(400) });
    setHabits(next.habits);
    setLogs(next.logs);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (!hasLoaded.current) setLoading(true);
      void load()
        .catch((err) => {
          if (!cancelled) {
            setError(getErrorMessage(err, "Não foi possível carregar os hábitos."));
          }
        })
        .finally(() => {
          if (!cancelled) {
            hasLoaded.current = true;
            setLoading(false);
          }
        });
      return () => {
        cancelled = true;
      };
    }, [load])
  );

  async function onRefresh() {
    setRefreshing(true);
    try {
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Não foi possível atualizar."));
    } finally {
      setRefreshing(false);
    }
  }

  async function onToggle(habitId: string, date: string, nextCompleted?: boolean) {
    const done = logs.some(
      (log) => log.habit_id === habitId && log.date === date && log.completed
    );
    const next = nextCompleted ?? !done;
    if (next === done) return;
    const key = `${habitId}:${date}`;
    const previous = logs;
    setBusyKey(key);
    setLogs((current) => {
      const idx = current.findIndex(
        (log) => log.habit_id === habitId && log.date === date
      );
      if (idx >= 0) {
        const copy = [...current];
        copy[idx] = { ...copy[idx], completed: next };
        return copy;
      }
      return [
        ...current,
        {
          id: `optimistic-${habitId}-${date}`,
          habit_id: habitId,
          date,
          completed: next,
        },
      ];
    });
    try {
      await toggleHabitLog(habitId, date, next);
    } catch (err) {
      setLogs(previous);
      fail(getErrorMessage(err, "Não foi possível atualizar o hábito."));
    } finally {
      setBusyKey(null);
    }
  }

  const doneCount = useMemo(
    () =>
      habits.filter((habit) =>
        isCompletedToday(
          logs.filter((log) => log.habit_id === habit.id),
          today
        )
      ).length,
    [habits, logs, today]
  );

  const insights = useMemo(() => getHabitInsights(habits, logs), [habits, logs]);
  const overallMap = useMemo(
    () =>
      buildOverallMonthHeatmap(
        habits,
        logs,
        monthCursor.year,
        monthCursor.month,
        today
      ),
    [habits, logs, monthCursor.month, monthCursor.year, today]
  );
  const canGoNext =
    monthCursor.year < now.getFullYear() ||
    (monthCursor.year === now.getFullYear() &&
      monthCursor.month < now.getMonth() + 1);

  return (
    <ThemedView style={styles.flex}>
      <Banner message={error} style={styles.banner} />
      {loading && habits.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.list,
            { paddingBottom: bottomInset + 24 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void onRefresh()}
            />
          }
        >
          <ChipBar
            options={[
              { id: "today", label: "Hoje" },
              { id: "month", label: "Mês" },
            ]}
            value={view}
            onChange={setView}
          />
          <ThemedText type="small" themeColor="textSecondary">
            {habits.length === 0
              ? "Crie hábitos para acompanhar a rotina."
              : `Hoje: ${doneCount}/${habits.length}`}
          </ThemedText>
          {habits.length === 0 ? (
            <ThemedText themeColor="textSecondary">
              Use o + para criar um hábito ou um anti-hábito (“Sem delivery”).
            </ThemedText>
          ) : view === "month" ? (
            <>
              {insights.map((insight) => (
                <Card key={insight.id} style={styles.card}>
                  <ThemedText type="smallBold">{insight.title}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {insight.detail}
                  </ThemedText>
                </Card>
              ))}
              <Card style={styles.card}>
                <HabitMonthHeatmap
                  map={overallMap}
                  onPrev={() => setMonthCursor((cur) => shiftMonth(cur.year, cur.month, -1))}
                  onNext={() => setMonthCursor((cur) => shiftMonth(cur.year, cur.month, 1))}
                  canGoNext={canGoNext}
                  title="Todos os hábitos"
                />
              </Card>
              {habits.map((habit) => {
                const avoid = isAvoidHabit(habit);
                const map = buildHabitMonthHeatmap(
                  logs.filter((log) => log.habit_id === habit.id),
                  monthCursor.year,
                  monthCursor.month,
                  {
                    today,
                    markMissed: habit.frequency !== "weekly",
                  }
                );
                return (
                  <Card key={habit.id} style={styles.card}>
                    <Pressable
                      onPress={() =>
                        router.push({
                          pathname: "/habits/form",
                          params: { id: habit.id },
                        })
                      }
                    >
                      <ThemedText type="smallBold">{habit.name}</ThemedText>
                    </Pressable>
                    <HabitMonthHeatmap map={map} avoid={avoid} showLegend={false} />
                  </Card>
                );
              })}
            </>
          ) : (
            habits.map((habit) => {
              const habitLogs = logs.filter((log) => log.habit_id === habit.id);
              const avoid = isAvoidHabit(habit);
              const done = isCompletedToday(habitLogs, today);
              const streak = calculateStreak(habitLogs);
              const weekPct = getWeekProgress(habit, habitLogs);
              const strip = getWeekStrip(habitLogs);
              return (
                <Card key={habit.id} style={styles.card}>
                  <View style={styles.row}>
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: done }}
                      accessibilityLabel={
                        avoid
                          ? done
                            ? `Desmarcar dia limpo de ${habit.name}`
                            : `Marcar dia limpo de ${habit.name}`
                          : done
                            ? `Desmarcar ${habit.name}`
                            : `Concluir ${habit.name}`
                      }
                      disabled={busyKey === `${habit.id}:${today}`}
                      onPress={() => void onToggle(habit.id, today)}
                      style={[
                        styles.check,
                        {
                          borderColor: done
                            ? avoid
                              ? "#0D9488"
                              : theme.success
                            : theme.textSecondary,
                          backgroundColor: done
                            ? avoid
                              ? "#0D9488"
                              : theme.success
                            : "transparent",
                        },
                      ]}
                    />
                    <Pressable
                      onPress={() =>
                        router.push({
                          pathname: "/habits/form",
                          params: { id: habit.id },
                        })
                      }
                      style={styles.copy}
                    >
                      <ThemedText type="smallBold">{habit.name}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {[
                          avoid ? "Anti-hábito" : null,
                          habit.is_health ? "Saúde" : null,
                          frequencyLabel(habit),
                          `${avoid ? "Dias limpos" : "Sequência"}: ${streak}`,
                          `Semana: ${weekPct}%`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </ThemedText>
                    </Pressable>
                  </View>
                  <HabitWeekStrip
                    days={strip}
                    avoid={avoid}
                    onToggleDay={(date, next) =>
                      void onToggle(habit.id, date, next)
                    }
                  />
                </Card>
              );
            })
          )}
        </ScrollView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  banner: { marginHorizontal: Spacing.four, marginTop: Spacing.three },
  list: { padding: Spacing.four, gap: Spacing.three },
  card: { padding: Spacing.three, gap: Spacing.three },
  row: { flexDirection: "row", alignItems: "flex-start", gap: Spacing.three },
  check: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    marginTop: 2,
  },
  copy: { flex: 1, gap: 4 },
});
