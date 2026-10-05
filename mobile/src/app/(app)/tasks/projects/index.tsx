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

import { fetchProjectEvents } from "@/api/tasks/events";
import { fetchProjects } from "@/api/tasks/projects";
import { fetchTasks } from "@/api/tasks/tasks";
import { ChipBar } from "@/components/ChipBar";
import { ChoiceChip } from "@/components/ChoiceChip";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner, Card, EmptyState } from "@/components/ui";
import { Radius, Spacing } from "@/constants/theme";
import {
  groupProjectsByStatus,
  openTasksForProject,
  visibleProjects,
} from "@/domain/tasks/listView";
import { useAppShell } from "@/hooks/use-app-shell";
import { useTheme } from "@/hooks/use-theme";
import { formatEventWhen } from "@/lib/dates";
import { getErrorMessage } from "@/lib/errors";
import {
  PROJECT_STATUS_LABELS,
  type Project,
  type ProjectEvent,
  type Task,
} from "@/types/tasks";

export default function ProjectsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { bottomInset } = useAppShell();
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<ProjectEvent[]>([]);
  const [view, setView] = useState<"lista" | "kanban">("lista");
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const hasLoaded = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const [nextProjects, nextTasks, nextEvents] = await Promise.all([
      fetchProjects(),
      fetchTasks(),
      fetchProjectEvents(),
    ]);
    setProjects(nextProjects);
    setTasks(nextTasks);
    setEvents(nextEvents);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (!hasLoaded.current) setLoading(true);
      void load()
        .catch((err) => {
          if (!cancelled) {
            setError(
              getErrorMessage(err, "Não foi possível carregar os projetos.")
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
      setError(getErrorMessage(err, "Não foi possível atualizar."));
    } finally {
      setRefreshing(false);
    }
  }

  const listRows = useMemo(
    () => (showArchived ? projects : visibleProjects(projects)),
    [projects, showArchived]
  );
  const kanbanGroups = useMemo(
    () => groupProjectsByStatus(projects),
    [projects]
  );
  const nextEventByProject = useMemo(() => {
    const now = new Date().toISOString();
    const map = new Map<string, ProjectEvent>();
    for (const event of events) {
      if (!event.project_id || event.starts_at < now) continue;
      if (!map.has(event.project_id)) map.set(event.project_id, event);
    }
    return map;
  }, [events]);

  function renderCard(project: Project) {
    const openCount = openTasksForProject(tasks, project.id).length;
    const nextEvent = nextEventByProject.get(project.id);
    return (
      <Card
        key={project.id}
        style={{ borderLeftWidth: 3, borderLeftColor: project.color || theme.primary }}
      >
      <Pressable
        onPress={() => router.navigate(`/tasks/projects/${project.id}`)}
        style={styles.card}
      >
        <View style={styles.cardHead}>
          <View
            style={[
              styles.dot,
              { backgroundColor: project.color || theme.primary },
            ]}
          />
          <ThemedText type="small" themeColor="mutedForeground">
            {PROJECT_STATUS_LABELS[project.status]}
          </ThemedText>
        </View>
        <ThemedText type="smallBold">{project.name}</ThemedText>
        {project.description ? (
          <ThemedText
            type="small"
            themeColor="mutedForeground"
            numberOfLines={2}
          >
            {project.description}
          </ThemedText>
        ) : null}
        <ThemedText type="small" themeColor="mutedForeground">
          {openCount === 0
            ? "Sem tarefas em aberto"
            : `${openCount} tarefa${openCount === 1 ? "" : "s"} em aberto`}
        </ThemedText>
        {nextEvent ? (
          <ThemedText type="small" themeColor="mutedForeground">
            Próximo: {nextEvent.title} · {formatEventWhen(nextEvent.starts_at)}
          </ThemedText>
        ) : null}
      </Pressable>
      </Card>
    );
  }

  return (
    <ThemedView style={styles.flex}>
      <Banner message={error} style={styles.banner} />
      {loading && projects.length === 0 ? (
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
            ]}
            value={view}
            onChange={setView}
          />
          {view === "lista" ? (
            <ChoiceChip
              label={showArchived ? "Arquivados visíveis" : "Mostrar arquivados"}
              active={showArchived}
              onPress={() => setShowArchived((cur) => !cur)}
            />
          ) : null}
          {view === "lista" ? (
            listRows.length === 0 ? (
              <EmptyState
                icon="folder-open-outline"
                title="Nenhum projeto ainda"
                description="Use o + para criar um projeto."
              />
            ) : (
              listRows.map(renderCard)
            )
          ) : (
            kanbanGroups.map((group) => (
              <View key={group.id} style={styles.section}>
                <ThemedText type="small" themeColor="mutedForeground">
                  {PROJECT_STATUS_LABELS[group.id]} · {group.items.length}
                </ThemedText>
                {group.items.length === 0 ? (
                  <ThemedText type="small" themeColor="mutedForeground">
                    Vazio
                  </ThemedText>
                ) : (
                  group.items.map(renderCard)
                )}
              </View>
            ))
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
    gap: Spacing.two,
  },
  section: { gap: Spacing.two, marginTop: Spacing.two },
  card: {
    padding: Spacing.three,
    gap: 6,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  dot: { width: 8, height: 8, borderRadius: Radius.full },
  banner: {
    marginHorizontal: Spacing.four,
    marginTop: Spacing.two,
  },
});
