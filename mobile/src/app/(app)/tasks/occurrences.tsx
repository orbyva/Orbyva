import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { fetchTaskById, fetchTasks } from "@/api/tasks/tasks";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Badge, Banner } from "@/components/ui";
import { Radius, Spacing } from "@/constants/theme";
import { findSeriesTasks } from "@/domain/tasks/agenda";
import {
  describeOccurrences,
  emptyAttendanceMessage,
  type OccurrenceRow,
} from "@/domain/tasks/occurrences";
import { useAppShell } from "@/hooks/use-app-shell";
import { useTheme } from "@/hooks/use-theme";
import { getErrorMessage } from "@/lib/errors";
import type { Task } from "@/types/tasks";

export default function SeriesOccurrencesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { bottomInset } = useAppShell();
  const params = useLocalSearchParams<{ id?: string }>();
  const taskId = typeof params.id === "string" ? params.id : null;
  const [seriesTask, setSeriesTask] = useState<Task | null>(null);
  const [rows, setRows] = useState<OccurrenceRow[]>([]);
  const [empty, setEmpty] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!taskId) return;
      let cancelled = false;
      void (async () => {
        try {
          const [task, all] = await Promise.all([fetchTaskById(taskId), fetchTasks()]);
          if (!task) throw new Error("Tarefa não encontrada.");
          const origin = task.recurrence_origin_id
            ? (all.find((row) => row.id === task.recurrence_origin_id) ?? task)
            : task;
          const series = findSeriesTasks(all, task);
          if (cancelled) return;
          setSeriesTask(origin);
          setRows(describeOccurrences(origin, series));
          setEmpty(emptyAttendanceMessage(origin, series));
        } catch (err) {
          if (!cancelled) setError(getErrorMessage(err, "Não foi possível carregar as ocorrências."));
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [taskId])
  );

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator color={theme.primary} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: bottomInset + 24 }]}>
        <Banner message={error} />
        {seriesTask ? <ThemedText type="subtitle">“{seriesTask.title}”</ThemedText> : null}
        {empty ? (
          <ThemedText type="small" themeColor="mutedForeground">
            {empty}
          </ThemedText>
        ) : null}
        {rows.map((row) => (
          <Pressable
            key={row.id}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: "/tasks/form", params: { id: row.id } })}
            style={[styles.row, { borderColor: theme.border, backgroundColor: theme.card }]}
          >
            <View style={styles.rowCopy}>
              <ThemedText type="small">{row.label}</ThemedText>
              {row.late ? <Badge label="Atrasada" variant="destructive" /> : null}
            </View>
            <Badge label={row.statusLabel} variant="outline" />
          </Pressable>
        ))}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: Spacing.four, gap: Spacing.two },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
  },
  rowCopy: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
});
