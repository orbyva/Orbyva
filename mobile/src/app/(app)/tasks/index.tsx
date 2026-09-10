import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import { fetchProjects } from "@/api/tasks/projects";
import { fetchTags } from "@/api/tasks/tags";
import {
  completeTaskApi,
  fetchTasks,
  reopenTaskApi,
  setTaskStatusApi,
} from "@/api/tasks/tasks";
import { ChipBar } from "@/components/ChipBar";
import { TasksKanban } from "@/components/TasksKanban";
import { TasksList } from "@/components/TasksList";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import {
  filterTasksByProject,
  filterTasksByQuery,
  filterTasksByTag,
  groupSubtasksByParentId,
  groupTasksForList,
  openTopLevelTasks,
  recentCompletedTasks,
  TAG_FILTER_ALL,
  TASK_LIST_BUCKETS,
  todayIsoDate,
  visibleProjects,
} from "@/domain/tasks/listView";
import { useAppShell } from "@/hooks/use-app-shell";
import { useTheme } from "@/hooks/use-theme";
import { getErrorMessage } from "@/lib/errors";
import {
  PROJECT_FILTER_ALL,
  PROJECT_FILTER_NONE,
  TASK_STATUS_LABELS,
  type Project,
  type Tag,
  type Task,
  type TaskStatus,
} from "@/types/tasks";

export default function TasksScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { bottomInset } = useAppShell();
  const [rows, setRows] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [projectFilter, setProjectFilter] = useState(PROJECT_FILTER_ALL);
  const [tagFilter, setTagFilter] = useState(TAG_FILTER_ALL);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"lista" | "kanban" | "done">("lista");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const [nextTasks, nextProjects, nextTags] = await Promise.all([
      fetchTasks(),
      fetchProjects(),
      fetchTags(),
    ]);
    setRows(nextTasks);
    setProjects(nextProjects);
    setTags(nextTags);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      void load()
        .catch((err) => {
          if (!cancelled) {
            setError(
              getErrorMessage(err, "Não foi possível carregar as tarefas.")
            );
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
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

  async function onComplete(task: Task) {
    setBusyId(task.id);
    setError(null);
    const previous = rows;
    const now = new Date().toISOString();
    setRows((cur) =>
      cur.map((row) =>
        row.id === task.id
          ? { ...row, status: "done", completed_at: now }
          : row
      )
    );
    try {
      await completeTaskApi(task.id);
    } catch (err) {
      setRows(previous);
      setError(getErrorMessage(err, "Não foi possível concluir a tarefa."));
    } finally {
      setBusyId(null);
    }
  }

  async function onReopen(task: Task) {
    setBusyId(task.id);
    setError(null);
    const previous = rows;
    setRows((cur) =>
      cur.map((row) =>
        row.id === task.id
          ? { ...row, status: "todo", completed_at: null }
          : row
      )
    );
    try {
      await reopenTaskApi(task.id);
    } catch (err) {
      setRows(previous);
      setError(getErrorMessage(err, "Não foi possível reabrir a tarefa."));
    } finally {
      setBusyId(null);
    }
  }

  async function onMoveStatus(task: Task, status: TaskStatus) {
    if (task.status === status) return;
    setError(null);
    const previous = rows;
    const now = new Date().toISOString();
    setRows((cur) =>
      cur.map((row) =>
        row.id === task.id
          ? {
              ...row,
              status,
              completed_at: status === "done" ? now : null,
            }
          : row
      )
    );
    try {
      await setTaskStatusApi(task.id, status);
    } catch (err) {
      setRows(previous);
      setError(getErrorMessage(err, "Não foi possível mover a tarefa."));
    }
  }

  function openTask(task: Task) {
    router.push({ pathname: "/tasks/form", params: { id: task.id } });
  }

  const projectChips = useMemo(
    () => [
      { id: PROJECT_FILTER_ALL, label: "Todos" },
      { id: PROJECT_FILTER_NONE, label: "Sem projeto" },
      ...visibleProjects(projects).map((project) => ({
        id: project.id,
        label: project.name,
      })),
    ],
    [projects]
  );

  const scoped = useMemo(
    () =>
      filterTasksByQuery(
        filterTasksByTag(filterTasksByProject(rows, projectFilter), tagFilter),
        query
      ),
    [projectFilter, query, rows, tagFilter]
  );
  const grouped = useMemo(
    () => groupTasksForList(scoped, todayIsoDate()),
    [scoped]
  );
  const sections = TASK_LIST_BUCKETS.map((bucket) => ({
    ...bucket,
    items: grouped[bucket.id],
  }));
  const completed = useMemo(
    () => recentCompletedTasks(scoped),
    [scoped]
  );
  const childrenByParent = useMemo(
    () => groupSubtasksByParentId(rows),
    [rows]
  );
  const openTasks = useMemo(() => openTopLevelTasks(scoped), [scoped]);
  const kanbanSections = useMemo(
    (): { id: TaskStatus; label: string; items: Task[] }[] => [
      {
        id: "todo",
        label: TASK_STATUS_LABELS.todo,
        items: openTasks.filter((task) => task.status === "todo"),
      },
      {
        id: "doing",
        label: TASK_STATUS_LABELS.doing,
        items: openTasks.filter((task) => task.status === "doing"),
      },
      {
        id: "done",
        label: TASK_STATUS_LABELS.done,
        items: recentCompletedTasks(scoped, 40),
      },
    ],
    [openTasks, scoped]
  );
  const listSections =
    view === "kanban"
      ? kanbanSections
      : view === "done"
        ? [{ id: "done", label: "Concluídas", items: completed }]
        : sections;

  return (
    <ThemedView style={styles.flex}>
      {error ? (
        <ThemedText style={styles.error}>{error}</ThemedText>
      ) : null}
      {loading && rows.length === 0 ? (
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
              { id: "lista", label: "Lista" },
              { id: "kanban", label: "Kanban" },
              { id: "done", label: "Concluídas" },
            ]}
            value={view}
            onChange={setView}
          />
          <ThemedText type="small" themeColor="textSecondary">
            {view === "lista"
              ? "Pendentes nas caixas da agenda: atrasadas, hoje, semana, mês, depois e sem data."
              : view === "kanban"
                ? "Segure o punho e solte em outra coluna para mudar o status."
                : "Concluídas recentes — o check reabre."}
          </ThemedText>
          <TextInput
            placeholder="Buscar tarefas"
            placeholderTextColor={theme.textSecondary}
            value={query}
            onChangeText={setQuery}
            style={[
              styles.search,
              {
                color: theme.text,
                borderColor: theme.backgroundSelected,
                backgroundColor: theme.backgroundElement,
              },
            ]}
          />
          {projectChips.length > 2 ? (
            <View style={styles.chips}>
              {projectChips.map((chip) => (
                <Pressable
                  key={chip.id}
                  onPress={() => setProjectFilter(chip.id)}
                  style={[
                    styles.chip,
                    { backgroundColor: theme.backgroundElement },
                    projectFilter === chip.id && {
                      backgroundColor: theme.backgroundSelected,
                    },
                  ]}
                >
                  <ThemedText type="smallBold">{chip.label}</ThemedText>
                </Pressable>
              ))}
            </View>
          ) : null}
          {tags.length > 0 ? (
            <View style={styles.chips}>
              <Pressable
                onPress={() => setTagFilter(TAG_FILTER_ALL)}
                style={[
                  styles.chip,
                  { backgroundColor: theme.backgroundElement },
                  tagFilter === TAG_FILTER_ALL && {
                    backgroundColor: theme.backgroundSelected,
                  },
                ]}
              >
                <ThemedText type="smallBold">Todas as tags</ThemedText>
              </Pressable>
              {tags.map((tag) => (
                <Pressable
                  key={tag.id}
                  onPress={() => setTagFilter(tag.id)}
                  style={[
                    styles.chip,
                    { backgroundColor: theme.backgroundElement },
                    tagFilter === tag.id && {
                      backgroundColor: theme.backgroundSelected,
                    },
                  ]}
                >
                  <ThemedText type="smallBold">{tag.name}</ThemedText>
                </Pressable>
              ))}
            </View>
          ) : null}
          {view === "kanban" ? (
            <TasksKanban
              columns={kanbanSections}
              busyId={busyId}
              onComplete={(task) => void onComplete(task)}
              onReopen={(task) => void onReopen(task)}
              onOpen={openTask}
              onMoveStatus={(task, status) => void onMoveStatus(task, status)}
              childrenByParent={childrenByParent}
            />
          ) : (
            <TasksList
              sections={listSections}
              busyId={busyId}
              onComplete={(task) => void onComplete(task)}
              onReopen={(task) => void onReopen(task)}
              onOpen={openTask}
              childrenByParent={childrenByParent}
              emptyTitle={
                view === "done"
                  ? "Nenhuma concluída recente"
                  : "Nenhuma tarefa em aberto"
              }
              emptyHint={
                view === "done"
                  ? "Conclua uma tarefa para ela aparecer aqui."
                  : "Use o + para criar uma com título e prazo."
              }
            />
          )}
        </ScrollView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    gap: Spacing.three,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.two },
  search: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  error: {
    color: "#E11D48",
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
  },
});
