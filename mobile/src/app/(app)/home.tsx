import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
} from "react-native";

import { loadHubBundle, type HubBundle, type HubHabitToday } from "@/api/hub";
import { toggleHabitLog } from "@/api/habits/habits";
import { FirstTxChecklist } from "@/components/hub/FirstTxChecklist";
import { HubAlerts } from "@/components/hub/HubAlerts";
import { HubDaySummary } from "@/components/hub/HubDaySummary";
import { HubLedgerHero } from "@/components/hub/HubLedgerHero";
import { HubModulesGrid } from "@/components/hub/HubModulesGrid";
import { HubStaleNudge } from "@/components/hub/HubStaleNudge";
import { HubUpcoming } from "@/components/hub/HubUpcoming";
import { MonthShareCard } from "@/components/hub/MonthShareCard";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner } from "@/components/ui/Banner";
import { Spacing } from "@/constants/theme";
import { formatMomTrend, previousYearMonth } from "@/domain/finance/insights";
import { daysSinceIsoDate, firstNameFromUser, getTodayIso, todayHeading } from "@/domain/timeline";
import { useAppShell } from "@/hooks/use-app-shell";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import type { TimelineItem } from "@/types/timeline";

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const { fail } = useFeedback();
  const { bottomInset } = useAppShell();
  const first = firstNameFromUser(user);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bundle, setBundle] = useState<HubBundle | null>(null);
  const [staleDismissed, setStaleDismissed] = useState(false);
  const [busyHabitId, setBusyHabitId] = useState<string | null>(null);
  const hasLoaded = useRef(false);

  const load = useCallback(async () => {
    setError(null);
    const next = await loadHubBundle();
    setBundle(next);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (!hasLoaded.current) setLoading(true);
      void load()
        .catch((err) => {
          if (!cancelled) {
            setError(getErrorMessage(err, "Não foi possível carregar o Início."));
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

  const daysWithoutTx = useMemo(
    () => daysSinceIsoDate(bundle?.latestTransactionAt),
    [bundle?.latestTransactionAt]
  );
  const showStale =
    !staleDismissed && daysWithoutTx != null && daysWithoutTx >= 3;
  const momDespesa = bundle
    ? formatMomTrend(
        bundle.despesa,
        bundle.prevDespesa,
        previousYearMonth(bundle.year, bundle.month).month
      )
    : null;
  const urgentCount = bundle?.alerts.length ?? 0;
  const extraAlerts = Math.max(0, urgentCount - 2);

  function openFinance() {
    router.navigate("/finance");
  }

  function openItem(item: TimelineItem) {
    router.navigate(item.href ?? "/finance");
  }

  async function onToggleHabit(habit: HubHabitToday) {
    const today = getTodayIso();
    setBusyHabitId(habit.id);
    setBundle((cur) => {
      if (!cur) return cur;
      return {
        ...cur,
        day: {
          ...cur.day,
          habits: cur.day.habits.map((row) =>
            row.id === habit.id ? { ...row, done: !row.done } : row
          ),
          habitsDone: cur.day.habits.reduce((sum, row) => {
            const done = row.id === habit.id ? !row.done : row.done;
            return sum + (done ? 1 : 0);
          }, 0),
        },
      };
    });
    try {
      await toggleHabitLog(habit.id, today, !habit.done);
    } catch (err) {
      setBundle((cur) => {
        if (!cur) return cur;
        return {
          ...cur,
          day: {
            ...cur.day,
            habits: cur.day.habits.map((row) =>
              row.id === habit.id ? { ...row, done: habit.done } : row
            ),
            habitsDone: cur.day.habits.reduce((sum, row) => {
              const done = row.id === habit.id ? habit.done : row.done;
              return sum + (done ? 1 : 0);
            }, 0),
          },
        };
      });
      fail(getErrorMessage(err, "Não foi possível atualizar o hábito."));
    } finally {
      setBusyHabitId(null);
    }
  }

  if (loading && !bundle) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator color={theme.primary} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.flex}>
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: bottomInset + 24 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
          />
        }
      >
        <ThemedText type="small" themeColor="textSecondary">
          {todayHeading()}
        </ThemedText>
        <ThemedText type="value">
          {first ? `Olá, ${first}` : "Olá"}
        </ThemedText>

        <Banner message={error} />

        {bundle ? (
          <HubLedgerHero
            year={bundle.year}
            month={bundle.month}
            saldo={bundle.receita - bundle.despesa}
            receita={bundle.receita}
            despesa={bundle.despesa}
            momDespesa={momDespesa}
            budgetHighlight={bundle.budgetHighlight}
            recurringAlerts={bundle.recurringAlerts}
            onOpenFinance={openFinance}
          />
        ) : null}

        <FirstTxChecklist />

        {bundle ? (
          <MonthShareCard
            year={bundle.year}
            month={bundle.month}
            receita={bundle.receita}
            despesa={bundle.despesa}
            budgetPlanned={bundle.budgetHighlight?.planned ?? null}
          />
        ) : null}

        {showStale && daysWithoutTx != null ? (
          <HubStaleNudge
            daysWithoutTx={daysWithoutTx}
            onAdd={() => router.push("/finance/form")}
            onDismiss={() => setStaleDismissed(true)}
          />
        ) : null}

        <HubAlerts
          alerts={bundle?.alerts ?? []}
          extraCount={extraAlerts}
          onPressItem={(alert) => router.navigate(alert.href)}
        />

        {bundle ? (
          <HubDaySummary
            day={bundle.day}
            onOpenFinance={openFinance}
            onOpenTasks={() => router.navigate("/tasks")}
            onOpenHabits={() => router.navigate("/habits")}
            onOpenMovies={() => router.navigate("/movies")}
            onToggleHabit={(habit) => void onToggleHabit(habit)}
            busyHabitId={busyHabitId}
          />
        ) : null}

        <HubUpcoming
          items={bundle?.upcoming ?? []}
          recent={bundle?.recent ?? []}
          onOpenTimeline={() => router.navigate("/timeline")}
          onOpenItem={openItem}
        />

        <HubModulesGrid
          onOpen={(href) => router.navigate(href)}
        />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: { padding: Spacing.four, gap: Spacing.three },
});
