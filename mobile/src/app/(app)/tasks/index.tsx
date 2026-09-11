import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import { fetchProjects } from "@/api/tasks/projects";
import { fetchFirstExternalLinkByTask } from "@/api/tasks/links";
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
import { Banner } from "@/components/ui/Banner";
import { Spacing } from "@/constants/theme";
import { PRIORITY_OPTIONS } from "@/domain/tasks/priority";
import {
  filterTasksByPriority,
  filterTasksByProject,
  filterTasksByQuery,
  filterTasksByTag,
  filterTasksDueToday,
  groupSubtasksByParentId,
  groupTasksForList,
  openTopLevelTasks,
  PRIORITY_FILTER_ALL,
  recentCompletedTasks,
  TAG_FILTER_ALL,
  TASK_LIST_BUCKETS,
  todayIsoDate,
  visibleProjects,
} from "@/domain/tasks/listView";
import { useAppShell } from "@/hooks/use-app-shell";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-toast";
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
  const { fail } = useFeedback();
  const router = useRouter();
  const { bottomInset } = useAppShell();
  const [rows, setRows] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [projectFilter, setProjectFilter] = useState(PROJECT_FILTER_ALL);
  const [tagFilter, setTagFilter] = useState(TAG_FILTER_ALL);
  const [priorityFilter, setPriorityFilter] = useState(PRIORITY_FILTER_ALL);
  const [todayOnly, setTodayOnly] = useState(false);
  const [linksByTaskId, setLinksByTaskId] = useState<
    Record<string, { url: string; comment: string | null }>
  >({});
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"lista" | "kanban" | "done">("lista");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const hasLoaded = useRef(false);

  const load = useCallback(async () => {
    setError(null);
    const [nextTasks, nextProjects, nextTags, nextLinks] = await Promise.all([
      fetchTasks(),
      fetchProjects(),
      fetchTags(),
      fetchFirstExternalLinkByTask().catch(
        () => ({}) as Record<string, { url: string; comment: string | null }>
      ),
    ]);
    setRows(nextTasks);
    setProjects(nextProjects);
    setTags(nextTags);
    setLinksByTaskId(nextLinks);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (!hasLoaded.current) setLoading(true);
      void load()
        .catch((err) => {
          if (!cancelled) {
            setError(
              getErrorMessage(err, "Não foi possível carregar as tarefas.")
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
      fail(getErrorMessage(err, "Não foi possível concluir a tarefa."));
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
      fail(getErrorMessage(err, "Não foi possível reabrir a tarefa."));
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
      fail(getErrorMessage(err, "Não foi possível mover a tarefa."));
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
      filterTasksDueToday(
        filterTasksByPriority(
          filterTasksByQuery(
            filterTasksByTag(
              filterTasksByProject(rows, projectFilter),
              tagFilter
            ),
            query
          ),
          priorityFilter
        ),
        todayIsoDate(),
        todayOnly
      ),
    [priorityFilter, projectFilter, query, rows, tagFilter, todayOnly]
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
      <Banner message={error} style={styles.banner} />
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
            <ChipBar
              options={projectChips}
              value={projectFilter}
              onChange={setProjectFilter}
            />
          ) : null}
          {tags.length > 0 ? (
            <ChipBar
              options={[
                { id: TAG_FILTER_ALL, label: "Todas as tags" },
                ...tags.map((tag) => ({ id: tag.id, label: tag.name })),
              ]}
              value={tagFilter}
              onChange={setTagFilter}
            />
          ) : null}
          <ChipBar
            options={[
              { id: PRIORITY_FILTER_ALL, label: "Prioridade" },
              ...PRIORITY_OPTIONS.filter((row) => row[0]).map(([id, label]) => ({
                id: id as string,
                label,
              })),
            ]}
            value={priorityFilter}
            onChange={setPriorityFilter}
          />
          <ChipBar
            options={[
              { id: "all", label: "Agenda" },
              { id: "today", label: "Só hoje" },
            ]}
            value={todayOnly ? "today" : "all"}
            onChange={(id) => setTodayOnly(id === "today")}
          />
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
              onChangeStatus={(task, status) => void onMoveStatus(task, status)}
              linksByTaskId={linksByTaskId}
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
  search: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  banner: {
    marginHorizontal: Spacing.four,
    marginTop: Spacing.two,
  },
});
