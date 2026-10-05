import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { fetchNotes } from "@/api/notes/notes";
import {
  fetchShoppingCategories,
  fetchShoppingItems,
  setShoppingItemStatusApi,
} from "@/api/shopping/items";
import { fetchDependencies } from "@/api/tasks/dependencies";
import { fetchProjectEvents } from "@/api/tasks/events";
import { fetchProjectById } from "@/api/tasks/projects";
import { completeTaskApi, fetchTasks, reopenTaskApi, setTaskStatusApi } from "@/api/tasks/tasks";
import { ChipBar } from "@/components/ChipBar";
import { TasksGantt } from "@/components/tasks/TasksGantt";
import { TasksKanban } from "@/components/TasksKanban";
import { ganttTasks } from "@/domain/tasks/gantt";
import { TasksList } from "@/components/TasksList";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner, EmptyState } from "@/components/ui";
import { Radius, Spacing } from "@/constants/theme";
import { filterNotesByProject, noteExcerpt } from "@/domain/notes/listView";
import { formatShoppingQty, groupShoppingItems } from "@/domain/shopping/listView";
import {
  emptyAgendaGroups,
  groupSubtasksByParentId,
  groupTasksForList,
  openTopLevelTasks,
  recentCompletedTasks,
  TASK_LIST_BUCKETS,
  todayIsoDate,
} from "@/domain/tasks/listView";
import { useAppShell } from "@/hooks/use-app-shell";
import { useTheme } from "@/hooks/use-theme";
import { formatDateBR } from "@/lib/currency";
import { formatEventWhen } from "@/lib/dates";
import { getErrorMessage } from "@/lib/errors";
import type { Note } from "@/types/notes";
import type { ShoppingCategory, ShoppingItem } from "@/types/shopping";
import {
  PROJECT_STATUS_LABELS,
  TASK_STATUS_LABELS,
  type Project,
  type ProjectEvent,
  type Task,
  type TaskDependency,
  type TaskStatus,
} from "@/types/tasks";

type ProjectTab = "lista" | "kanban" | "gantt" | "compras" | "notas";

export default function ProjectDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const { bottomInset } = useAppShell();
  const params = useLocalSearchParams<{ id?: string }>();
  const projectId = typeof params.id === "string" ? params.id : "";

  const [project, setProject] = useState<Project | null>(null);
  const [rows, setRows] = useState<Task[]>([]);
  const [events, setEvents] = useState<ProjectEvent[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [categories, setCategories] = useState<ShoppingCategory[]>([]);
  const [tab, setTab] = useState<ProjectTab>("lista");
  const [dependencies, setDependencies] = useState<TaskDependency[]>([]);
  const [loading, setLoading] = useState(true);
  const hasLoaded = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId) throw new Error("Projeto não encontrado.");
    setError(null);
    const [
      nextProject,
      nextTasks,
      nextEvents,
      nextNotes,
      nextItems,
      nextCategories,
      nextDeps,
    ] = await Promise.all([
      fetchProjectById(projectId),
      fetchTasks(),
      fetchProjectEvents(projectId),
      fetchNotes(),
      fetchShoppingItems(),
      fetchShoppingCategories(),
      fetchDependencies().catch(() => [] as TaskDependency[]),
    ]);
    if (!nextProject) throw new Error("Projeto não encontrado.");
    setProject(nextProject);
    setRows(nextTasks);
    setDependencies(nextDeps);
    setEvents(nextEvents);
    setNotes(nextNotes);
    setItems(nextItems);
    setCategories(nextCategories);
  }, [projectId]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (!hasLoaded.current) setLoading(true);
      void load()
        .catch((err) => {
          if (!cancelled) {
            setError(
              getErrorMessage(err, "Não foi possível carregar o projeto.")
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

  useEffect(() => {
    if (project) navigation.setOptions({ title: project.name });
  }, [navigation, project]);

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

  async function onToggleItem(item: ShoppingItem) {
    const next = item.status === "pending" ? "purchased" : "pending";
    setBusyId(item.id);
    const previous = items;
    setItems((cur) =>
      cur.map((row) => (row.id === item.id ? { ...row, status: next } : row))
    );
    try {
      await setShoppingItemStatusApi(item.id, next);
    } catch (err) {
      setItems(previous);
      setError(getErrorMessage(err, "Não foi possível atualizar o item."));
    } finally {
      setBusyId(null);
    }
  }

  const projectTasks = useMemo(
    () => rows.filter((task) => task.project_id === projectId),
    [projectId, rows]
  );
  const ganttProjectTasks = useMemo(() => ganttTasks(projectTasks), [projectTasks]);
  const grouped = useMemo(() => {
    if (!projectId) return emptyAgendaGroups<Task>();
    return groupTasksForList(projectTasks, todayIsoDate());
  }, [projectId, projectTasks]);
  const sections = TASK_LIST_BUCKETS.map((bucket) => ({
    ...bucket,
    items: grouped[bucket.id],
  }));
  const openTasks = useMemo(
    () => openTopLevelTasks(projectTasks),
    [projectTasks]
  );
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
        items: recentCompletedTasks(projectTasks, 40),
      },
    ],
    [openTasks, projectTasks]
  );
  const childrenByParent = useMemo(
    () => groupSubtasksByParentId(rows),
    [rows]
  );
  const projectNotes = useMemo(
    () => filterNotesByProject(notes, projectId),
    [notes, projectId]
  );
  const projectCategories = useMemo(
    () => categories.filter((category) => category.project_id === projectId),
    [categories, projectId]
  );
  const shoppingGroups = useMemo(
    () =>
      groupShoppingItems(items, projectCategories).filter(
        (group) => group.key !== "uncategorized"
      ),
    [items, projectCategories]
  );
  const upcomingEvents = useMemo(() => {
    const now = new Date().toISOString();
    return events.filter((event) => event.starts_at >= now);
  }, [events]);

  return (
    <ThemedView style={styles.flex}>
      <Banner message={error} />
      {loading && !project ? (
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
          {project ? (
            <View style={styles.head}>
              <ThemedText type="small" themeColor="mutedForeground">
                {PROJECT_STATUS_LABELS[project.status]}
              </ThemedText>
              {project.description ? (
                <ThemedText themeColor="mutedForeground">
                  {project.description}
                </ThemedText>
              ) : null}
              {upcomingEvents.map((event) => (
                <View key={event.id} style={styles.eventRow}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Editar evento ${event.title}`}
                    style={styles.eventTitle}
                    onPress={() =>
                      router.push({
                        pathname: "/tasks/projects/form",
                        params: { id: project.id, eventId: event.id },
                      })
                    }
                  >
                    <ThemedText type="small" themeColor="mutedForeground">
                      {event.title} · {formatEventWhen(event.starts_at)}
                    </ThemedText>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Convidar para ${event.title}`}
                    hitSlop={8}
                    onPress={() =>
                      router.push({
                        pathname: "/tasks/event-invites",
                        params: { eventId: event.id, title: event.title },
                      })
                    }
                  >
                    <ThemedText type="small" style={{ color: theme.primary }}>
                      Convidar
                    </ThemedText>
                  </Pressable>
                </View>
              ))}
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: "/tasks/projects/form",
                    params: { id: project.id },
                  })
                }
              >
                <ThemedText type="linkPrimary">Editar projeto</ThemedText>
              </Pressable>
            </View>
          ) : null}
          <ChipBar
            options={[
              { id: "lista", label: "Lista" },
              { id: "kanban", label: "Kanban" },
              { id: "gantt", label: "Gantt" },
              { id: "compras", label: `Compras (${shoppingGroups.reduce((n, g) => n + g.items.length, 0)})` },
              { id: "notas", label: `Notas (${projectNotes.length})` },
            ]}
            value={tab}
            onChange={setTab}
          />
          {tab === "lista" ? (
            <TasksList
              sections={sections}
              busyId={busyId}
              onComplete={(task) => void onComplete(task)}
              onReopen={(task) => void onReopen(task)}
              onOpen={(task) =>
                router.push({ pathname: "/tasks/form", params: { id: task.id } })
              }
              onChangeStatus={(task, status) => void onMoveStatus(task, status)}
              childrenByParent={childrenByParent}
            />
          ) : null}
          {tab === "kanban" ? (
            <TasksKanban
              columns={kanbanSections}
              busyId={busyId}
              onComplete={(task) => void onComplete(task)}
              onReopen={(task) => void onReopen(task)}
              onOpen={(task) =>
                router.push({ pathname: "/tasks/form", params: { id: task.id } })
              }
              onMoveStatus={(task, status) => void onMoveStatus(task, status)}
              childrenByParent={childrenByParent}
            />
          ) : null}
          {tab === "gantt" ? (
            <TasksGantt
              tasks={ganttProjectTasks}
              dependencies={dependencies}
              onDependenciesChange={async () => setDependencies(await fetchDependencies())}
              onOpenTask={(id) => router.push({ pathname: "/tasks/form", params: { id } })}
            />
          ) : null}
          {tab === "compras" ? (
            shoppingGroups.length === 0 ? (
              <EmptyState
                icon="cart-outline"
                title="Nenhuma compra neste projeto"
                description="Vincule uma categoria da lista de compras a este projeto."
              />
            ) : (
              shoppingGroups.map((group) => (
                <View key={group.key} style={styles.section}>
                  <ThemedText type="small" themeColor="mutedForeground">
                    {group.label}
                  </ThemedText>
                  {group.items.map((item) => (
                    <Pressable
                      key={item.id}
                      onPress={() => void onToggleItem(item)}
                      style={styles.row}
                    >
                      <ThemedText
                        style={
                          item.status === "purchased"
                            ? styles.done
                            : undefined
                        }
                      >
                        {item.title}
                        {formatShoppingQty(item)
                          ? ` · ${formatShoppingQty(item)}`
                          : ""}
                      </ThemedText>
                    </Pressable>
                  ))}
                </View>
              ))
            )
          ) : null}
          {tab === "notas" ? (
            <>
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: "/notes/form",
                    params: { projectId },
                  })
                }
              >
                <ThemedText type="linkPrimary">Nova nota neste projeto</ThemedText>
              </Pressable>
              {projectNotes.length === 0 ? (
                <EmptyState
                  icon="document-text-outline"
                  title="Nenhuma nota neste projeto"
                />
              ) : (
                projectNotes.map((note) => (
                  <Pressable
                    key={note.id}
                    onPress={() => router.navigate(`/notes/${note.id}`)}
                    style={[
                      styles.card,
                      { backgroundColor: theme.muted },
                    ]}
                  >
                    <ThemedText type="smallBold">{note.title}</ThemedText>
                    {noteExcerpt(note.content) ? (
                      <ThemedText
                        type="small"
                        themeColor="mutedForeground"
                        numberOfLines={2}
                      >
                        {noteExcerpt(note.content)}
                      </ThemedText>
                    ) : null}
                    <ThemedText type="small" themeColor="mutedForeground">
                      {formatDateBR(note.updated_at)}
                    </ThemedText>
                  </Pressable>
                ))
              )}
            </>
          ) : null}
        </ScrollView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  eventRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  eventTitle: { flex: 1 },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    gap: Spacing.three,
  },
  head: { gap: 6 },
  section: { gap: 8 },
  row: { paddingVertical: 8 },
  card: {
    borderRadius: Radius.xl,
    padding: Spacing.three,
    gap: 4,
  },
  done: { textDecorationLine: "line-through", opacity: 0.55 },
});
