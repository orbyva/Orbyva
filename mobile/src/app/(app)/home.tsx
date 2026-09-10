import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
} from "react-native";

import { loadHubBundle, type HubBundle } from "@/api/hub";
import { HubAlerts } from "@/components/hub/HubAlerts";
import { HubDaySummary } from "@/components/hub/HubDaySummary";
import { HubLedgerHero } from "@/components/hub/HubLedgerHero";
import { HubModulesGrid } from "@/components/hub/HubModulesGrid";
import { HubStaleNudge } from "@/components/hub/HubStaleNudge";
import { HubUpcoming } from "@/components/hub/HubUpcoming";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { formatMomTrend, previousYearMonth } from "@/domain/finance/insights";
import { daysSinceIsoDate, firstNameFromUser, todayHeading } from "@/domain/timeline";
import { useAppShell } from "@/hooks/use-app-shell";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { getErrorMessage } from "@/lib/errors";
import type { TimelineItem } from "@/types/timeline";

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const { bottomInset, setAlertsOpen } = useAppShell();
  const first = firstNameFromUser(user);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bundle, setBundle] = useState<HubBundle | null>(null);
  const [staleDismissed, setStaleDismissed] = useState(false);
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
        <ThemedText style={styles.hello}>
          {first ? `Olá, ${first}` : "Olá"}
        </ThemedText>

        {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}

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
          onOpen={() => {
            setAlertsOpen(true);
          }}
        />

        {bundle ? (
          <HubDaySummary
            day={bundle.day}
            onOpenFinance={openFinance}
            onOpenTasks={() => router.navigate("/tasks")}
          />
        ) : null}

        <HubUpcoming
          items={bundle?.upcoming ?? []}
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
  hello: { fontSize: 28, lineHeight: 34, fontWeight: "700" },
  error: { color: "#E11D48" },
});
