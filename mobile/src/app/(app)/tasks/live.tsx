import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { fetchProjects } from "@/api/tasks/projects";
import { fetchTasks } from "@/api/tasks/tasks";
import {
  deleteTimeEntry,
  fetchAllEntries,
} from "@/api/tasks/timeEntries";
import { ChipBar } from "@/components/ChipBar";
import { FilterRow, FilterSelect } from "@/components/FilterSelect";
import { TimeEntryEditor } from "@/components/tasks/TimeEntryEditor";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner, Button, EmptyState } from "@/components/ui";
import { Radius, Spacing } from "@/constants/theme";
import {
  elapsedSeconds,
  formatDuration,
  groupEntriesByDay,
} from "@/domain/tasks/timeTracking";
import { visibleProjects } from "@/domain/tasks/listView";
import { useActiveTimer } from "@/hooks/use-active-timer";
import { useAppShell } from "@/hooks/use-app-shell";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-toast";
import { formatDateBR } from "@/lib/currency";
import { formatLocalIsoDate } from "@/lib/dates";
import { getErrorMessage } from "@/lib/errors";
import {
  PROJECT_FILTER_ALL,
  type Project,
  type Task,
  type TaskTimeEntry,
} from "@/types/tasks";

export default function LiveScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { fail, ok } = useFeedback();
  const { bottomInset } = useAppShell();
  const params = useLocalSearchParams<{ project?: string }>();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [entries, setEntries] = useState<TaskTimeEntry[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [dateScope, setDateScope] = useState<"today" | "all">("today");
  const [projectFilter, setProjectFilter] = useState(
    typeof params.project === "string" ? params.project : PROJECT_FILTER_ALL
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [editingId, setEditingId] = useState<string | null>(null);
  const hasLoaded = useRef(false);
  const { runningEntry, start, stop } = useActiveTimer();

  const load = useCallback(async () => {
    setError(null);
    const [nextTasks, nextProjects, nextEntries] = await Promise.all([
      fetchTasks(),
      fetchProjects(),
      fetchAllEntries(),
    ]);
    setTasks(nextTasks);
    setProjects(nextProjects);
    setEntries(nextEntries);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (!hasLoaded.current) setLoading(true);
      void load()
        .catch((err) => {
          if (!cancelled) {
            setError(getErrorMessage(err, "Não foi possível carregar o Live."));
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

  useEffect(() => {
    if (!runningEntry) return;
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [runningEntry]);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await load();
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível atualizar."));
    } finally {
      setRefreshing(false);
    }
  }

  const openTasks = useMemo(
    () =>
      tasks.filter(
        (task) =>
          task.status !== "done" &&
          !(task.linked_recurring_id && task.linked_installment_number == null)
      ),
    [tasks]
  );
  const tasksById = useMemo(
    () => new Map(tasks.map((task) => [task.id, task])),
    [tasks]
  );
  const runningTask = runningEntry
    ? tasksById.get(runningEntry.task_id)
    : null;
  const runningSeconds = runningEntry
    ? elapsedSeconds(
        {
          taskId: runningEntry.task_id,
          startedAt: runningEntry.started_at,
          endedAt: null,
        },
        now
      )
    : 0;
  const todayIso = formatLocalIsoDate(now);
  const filtered = useMemo(
    () =>
      entries.filter((entry) => {
        if (
          dateScope === "today" &&
          formatLocalIsoDate(new Date(entry.started_at)) !== todayIso
        ) {
          return false;
        }
        if (
          projectFilter !== PROJECT_FILTER_ALL &&
          tasksById.get(entry.task_id)?.project_id !== projectFilter
        ) {
          return false;
        }
        return true;
      }),
    [dateScope, entries, projectFilter, tasksById, todayIso]
  );
  const groups = useMemo(
    () =>
      groupEntriesByDay(
        filtered.map((entry) => ({
          taskId: entry.task_id,
          startedAt: entry.started_at,
          endedAt: entry.ended_at,
          raw: entry,
        }))
      ),
    [filtered]
  );
  const projectOptions = useMemo(
    () => [
      { id: PROJECT_FILTER_ALL, label: "Todos os projetos" },
      ...visibleProjects(projects).map((project) => ({
        id: project.id,
        label: project.name,
      })),
    ],
    [projects]
  );

  async function onStart() {
    if (!selectedTaskId) {
      fail("Escolha uma tarefa.");
      return;
    }
    try {
      await start(selectedTaskId);
      setSelectedTaskId("");
      await load();
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível iniciar o timer."));
    }
  }

  async function onStop() {
    try {
      await stop();
      await load();
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível parar o timer."));
    }
  }

  function confirmDelete(id: string) {
    Alert.alert("Excluir registro", "Apagar este tempo marcado?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              await deleteTimeEntry(id);
              ok("Registro excluído");
              await load();
            } catch (err) {
              fail(getErrorMessage(err, "Não foi possível excluir."));
            }
          })();
        },
      },
    ]);
  }

  if (loading && entries.length === 0) {
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
        <Banner message={error} />
        {runningEntry ? (
          <View style={[styles.card, { backgroundColor: theme.muted }]}>
            <ThemedText type="small" themeColor="mutedForeground">
              Rodando
            </ThemedText>
            <ThemedText type="smallBold">
              {runningTask?.title ?? "Tarefa"}
            </ThemedText>
            <ThemedText type="title">{formatDuration(runningSeconds)}</ThemedText>
            <Button
              label="Parar"
              variant="destructive"
              leftIcon="stop"
              size="lg"
              onPress={() => void onStop()}
            />
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: theme.muted }]}>
            <ThemedText type="smallBold">Iniciar timer</ThemedText>
            <FilterSelect
              label="Tarefa"
              value={selectedTaskId || "none"}
              options={[
                { id: "none", label: "Escolher tarefa" },
                ...openTasks.map((task) => ({ id: task.id, label: task.title })),
              ]}
              onChange={(id) => setSelectedTaskId(id === "none" ? "" : id)}
            />
            <Button
              label="Começar"
              leftIcon="play"
              size="lg"
              onPress={() => void onStart()}
            />
          </View>
        )}
        <ChipBar
          options={[
            { id: "today", label: "Hoje" },
            { id: "all", label: "Tudo" },
          ]}
          value={dateScope}
          onChange={setDateScope}
        />
        {projectOptions.length > 1 ? (
          <FilterRow>
            <FilterSelect
              label="Projeto"
              value={projectFilter}
              options={projectOptions}
              onChange={setProjectFilter}
            />
          </FilterRow>
        ) : null}
        {groups.length === 0 ? (
          <EmptyState icon="timer-outline" title="Nenhum registro neste filtro" />
        ) : (
          groups.map((group) => (
            <View key={group.dayIso} style={styles.day}>
              <ThemedText type="small" themeColor="mutedForeground">
                {formatDateBR(group.dayIso)}
              </ThemedText>
              {group.entries.map((entry) => {
                const task = tasksById.get(entry.taskId);
                const seconds = elapsedSeconds(entry, now);
                return (
                  <View
                    key={entry.raw.id}
                    style={[styles.entry, { backgroundColor: theme.muted }]}
                  >
                    <View style={styles.row}>
                    <Pressable
                      style={styles.copy}
                      onPress={() =>
                        router.push({
                          pathname: "/tasks/form",
                          params: { id: entry.taskId },
                        })
                      }
                      onLongPress={() => confirmDelete(entry.raw.id)}
                    >
                      <ThemedText type="smallBold">
                        {task?.title ?? "Tarefa"}
                      </ThemedText>
                      <ThemedText type="small" themeColor="mutedForeground">
                        {formatDuration(seconds)}
                        {entry.endedAt ? "" : " · agora"}
                      </ThemedText>
                    </Pressable>
                    <Pressable
                      accessibilityLabel="Editar registro"
                      hitSlop={8}
                      onPress={() =>
                        setEditingId((cur) => (cur === entry.raw.id ? null : entry.raw.id))
                      }
                      style={styles.trash}
                    >
                      <Ionicons
                        name="create-outline"
                        size={18}
                        color={theme.mutedForeground}
                      />
                    </Pressable>
                    <Pressable
                      accessibilityLabel="Excluir registro"
                      hitSlop={8}
                      onPress={() => confirmDelete(entry.raw.id)}
                      style={styles.trash}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={18}
                        color={theme.destructive}
                      />
                    </Pressable>
                    </View>
                    {editingId === entry.raw.id ? (
                      <TimeEntryEditor
                        entry={entry.raw}
                        onCancel={() => setEditingId(null)}
                        onSaved={(updated) => {
                          setEntries((cur) =>
                            cur.map((row) => (row.id === updated.id ? updated : row))
                          );
                          setEditingId(null);
                        }}
                      />
                    ) : null}
                  </View>
                );
              })}
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
  card: { borderRadius: Radius.xl, padding: 14, gap: 10 },
  day: { gap: 8 },
  entry: { borderRadius: Radius.xl, padding: 12, gap: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  copy: { flex: 1, gap: 2, minWidth: 0 },
  trash: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
});
