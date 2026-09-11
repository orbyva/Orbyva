import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { fetchFinanceTimeline } from "@/api/timeline";
import { TimelineList } from "@/components/TimelineList";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner } from "@/components/ui/Banner";
import { Spacing } from "@/constants/theme";
import { groupTimelineByDate } from "@/domain/timeline";
import { useAppShell } from "@/hooks/use-app-shell";
import { useTheme } from "@/hooks/use-theme";
import { getErrorMessage } from "@/lib/errors";
import type { TimelineItem } from "@/types/timeline";

export default function TimelineScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { bottomInset } = useAppShell();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<TimelineItem[]>([]);
  const hasLoaded = useRef(false);

  const load = useCallback(async () => {
    setError(null);
    setItems(await fetchFinanceTimeline(90, 30));
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (!hasLoaded.current) setLoading(true);
      void load()
        .catch((err) => {
          if (!cancelled) {
            setError(
              getErrorMessage(err, "Não foi possível carregar a timeline.")
            );
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

  const grouped = useMemo(() => groupTimelineByDate(items), [items]);

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

  function openItem(item: TimelineItem) {
    router.navigate(item.href ?? "/finance");
  }

  if (loading && items.length === 0) {
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
        <ThemedText themeColor="textSecondary">
          Parcelas em aberto e tarefas com prazo. Vida e conteúdo entram na
          próxima fatia.
        </ThemedText>
        <Banner message={error} />
        {grouped.length === 0 ? (
          <ThemedText
            type="small"
            themeColor="textSecondary"
            style={styles.empty}
          >
            Nenhum evento encontrado.
          </ThemedText>
        ) : (
          grouped.map((group) => (
            <View key={group.date} style={styles.group}>
              <ThemedText type="small" themeColor="textSecondary">
                {group.dateLabel}
              </ThemedText>
              <TimelineList items={group.items} onPressItem={openItem} />
            </View>
          ))
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: { padding: Spacing.four, gap: Spacing.three },
  group: { gap: Spacing.two },
  empty: { textAlign: "center", paddingVertical: Spacing.five },
  error: { color: "#E11D48" },
});
