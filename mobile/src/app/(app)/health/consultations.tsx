import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { fetchConsultationTasks } from "@/api/health/health";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner, Button, ModuleSection } from "@/components/ui";
import { Spacing } from "@/constants/theme";
import { partitionConsultationHistory } from "@/domain/health/consultations";
import { useAppShell } from "@/hooks/use-app-shell";
import { useTheme } from "@/hooks/use-theme";
import { formatDateTimeBR } from "@/lib/currency";
import { getErrorMessage } from "@/lib/errors";
import type { Task } from "@/types/tasks";

function localDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return formatDateTimeBR(
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    `${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

export default function HealthConsultationsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { bottomInset } = useAppShell();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setTasks(await fetchConsultationTasks());
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void load()
        .catch((err) => {
          if (!cancelled) setError(getErrorMessage(err, "Não foi possível carregar as consultas."));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [load])
  );

  const { upcoming, history } = useMemo(() => partitionConsultationHistory(tasks), [tasks]);

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

  function renderRow(task: Task) {
    const when = task.due_date ? formatDateTimeBR(task.due_date, task.due_time) : "Sem data";
    const attended =
      task.status === "done" && task.completed_at ? ` · compareceu ${localDateTime(task.completed_at)}` : "";
    return (
      <Pressable
        key={task.id}
        accessibilityRole="button"
        onPress={() => router.push({ pathname: "/tasks/form", params: { id: task.id } })}
        style={styles.row}
      >
        <Ionicons
          name={task.status === "done" ? "checkmark-circle" : "calendar-outline"}
          size={18}
          color={task.status === "done" ? theme.success : theme.primary}
        />
        <View style={styles.rowCopy}>
          <ThemedText type="smallBold">{task.title}</ThemedText>
          <ThemedText type="small" themeColor="mutedForeground">
            {when}
            {attended}
          </ThemedText>
        </View>
      </Pressable>
    );
  }

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator color={theme.primary} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.flex}>
      <ScrollView
        contentContainerStyle={[styles.list, { paddingBottom: bottomInset + 24 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
      >
        <Banner message={error} />
        <Button label="Agendar consulta" onPress={() => router.push("/health/consult-form")} />
        {tasks.length === 0 ? (
          <ThemedText themeColor="mutedForeground">
            Nenhuma consulta agendada. Agende uma para vê-la aqui, em Saúde e na agenda.
          </ThemedText>
        ) : null}
        {upcoming.length > 0 ? (
          <ModuleSection
            title="Próximas"
            icon="calendar-outline"
            tint={theme.primary}
            badge={String(upcoming.length)}
          >
            {upcoming.map(renderRow)}
          </ModuleSection>
        ) : null}
        {history.length > 0 ? (
          <ModuleSection
            title="Histórico"
            icon="time-outline"
            tint={theme.mutedForeground}
            badge={String(history.length)}
          >
            {history.map(renderRow)}
          </ModuleSection>
        ) : null}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: Spacing.four, gap: Spacing.three },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  rowCopy: { flex: 1, gap: 2 },
});
