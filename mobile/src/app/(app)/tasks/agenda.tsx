import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import { fetchProjectEvents } from "@/api/tasks/events";
import { fetchProjects } from "@/api/tasks/projects";
import { fetchTasks } from "@/api/tasks/tasks";
import { AgendaHourGrid } from "@/components/AgendaHourGrid";
import { ChipBar } from "@/components/ChipBar";
import { FilterRow, FilterSelect } from "@/components/FilterSelect";
import { TaskIconBadge } from "@/components/TaskIconBadge";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner } from "@/components/ui/Banner";
import { Radius, Spacing } from "@/constants/theme";
import {
  computeMonthGridDays,
  computeWeekDays,
  dayTitle,
  groupCalendarItemsByDay,
  monthTitle,
  shiftDays,
  TASK_STATUS_COLORS,
  WEEKDAY_HEADERS,
  weekTitle,
  type CalendarItem,
} from "@/domain/tasks/calendar";
import { parseEventInviteToken } from "@/domain/tasks/eventInvites";
import { useAppShell } from "@/hooks/use-app-shell";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-toast";
import { formatLocalIsoDate } from "@/lib/dates";
import { getErrorMessage } from "@/lib/errors";
import {
  PROJECT_FILTER_ALL,
  TASK_STATUS_LABELS,
  type Project,
  type ProjectEvent,
  type Task,
} from "@/types/tasks";

const VISIBLE_CHIPS = 3;

function shiftMonth(year: number, month: number, delta: number) {
  const date = new Date(year, month - 1 + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

function itemTitle(item: CalendarItem): string {
  return item.kind === "task" ? item.task.title : item.event.title;
}

function itemColor(item: CalendarItem, projects: Project[]): string {
  if (item.kind === "task") {
    return TASK_STATUS_COLORS[item.task.status] ?? "#64748B";
  }
  const project = projects.find((row) => row.id === item.event.project_id);
  return project?.color || "#A855F7";
}

export default function AgendaScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { bottomInset } = useAppShell();
  const today = formatLocalIsoDate(new Date());
  const now = new Date();
  const [cursor, setCursor] = useState({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  });
  const [view, setView] = useState<"month" | "week" | "day">("month");
  const [focusIso, setFocusIso] = useState(today);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<ProjectEvent[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectFilter, setProjectFilter] = useState(PROJECT_FILTER_ALL);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dayIso, setDayIso] = useState<string | null>(null);
  const [inviteInput, setInviteInput] = useState("");
  const hasLoaded = useRef(false);
  const { fail } = useFeedback();

  function openPastedInvite() {
    const token = parseEventInviteToken(inviteInput);
    if (!token) {
      fail("Cole o link do convite (…/events/invite/…) ou o código dele.");
      return;
    }
    setInviteInput("");
    router.push({ pathname: "/tasks/event-invite/[token]", params: { token } });
  }

  const load = useCallback(async () => {
    setError(null);
    const [nextTasks, nextEvents, nextProjects] = await Promise.all([
      fetchTasks(),
      fetchProjectEvents(),
      fetchProjects(),
    ]);
    setTasks(nextTasks);
    setEvents(nextEvents);
    setProjects(nextProjects);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (!hasLoaded.current) setLoading(true);
      void load()
        .catch((err) => {
          if (!cancelled) {
            setError(getErrorMessage(err, "Não foi possível carregar a agenda."));
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

  const filteredTasks = useMemo(() => {
    if (projectFilter === PROJECT_FILTER_ALL) return tasks;
    return tasks.filter((task) => task.project_id === projectFilter);
  }, [projectFilter, tasks]);
  const filteredEvents = useMemo(() => {
    if (projectFilter === PROJECT_FILTER_ALL) return events;
    return events.filter((event) => event.project_id === projectFilter);
  }, [events, projectFilter]);
  const byDay = useMemo(
    () => groupCalendarItemsByDay(filteredTasks, filteredEvents),
    [filteredEvents, filteredTasks]
  );
  const grid = useMemo(
    () => computeMonthGridDays(cursor.year, cursor.month),
    [cursor.month, cursor.year]
  );
  const dayItems = dayIso ? byDay.get(dayIso) ?? [] : [];
  const projectChips = useMemo(
    () => [
      { id: PROJECT_FILTER_ALL, label: "Todos" },
      ...projects.map((project) => ({ id: project.id, label: project.name })),
    ],
    [projects]
  );

  function openItem(item: CalendarItem) {
    setDayIso(null);
    if (item.kind === "task") {
      router.push({ pathname: "/tasks/form", params: { id: item.task.id } });
      return;
    }
    if (item.event.project_id) {
      router.push({
        pathname: "/tasks/projects/[id]",
        params: { id: item.event.project_id },
      });
    }
  }

  if (loading && tasks.length === 0) {
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
        <ChipBar
          options={[
            { id: "month", label: "Mês" },
            { id: "week", label: "Semana" },
            { id: "day", label: "Dia" },
          ]}
          value={view}
          onChange={setView}
        />
        <View style={styles.monthRow}>
          <Pressable
            onPress={() => {
              if (view === "month") {
                setCursor((cur) => shiftMonth(cur.year, cur.month, -1));
                return;
              }
              setFocusIso(shiftDays(focusIso, view === "week" ? -7 : -1));
            }}
            style={[styles.monthBtn, { backgroundColor: theme.backgroundElement }]}
          >
            <ThemedText type="smallBold">‹</ThemedText>
          </Pressable>
          <ThemedText type="smallBold" style={styles.monthTitle}>
            {view === "month"
              ? monthTitle(cursor.year, cursor.month)
              : view === "week"
                ? weekTitle(focusIso)
                : dayTitle(focusIso)}
          </ThemedText>
          <Pressable
            onPress={() => {
              if (view === "month") {
                setCursor((cur) => shiftMonth(cur.year, cur.month, 1));
                return;
              }
              setFocusIso(shiftDays(focusIso, view === "week" ? 7 : 1));
            }}
            style={[styles.monthBtn, { backgroundColor: theme.backgroundElement }]}
          >
            <ThemedText type="smallBold">›</ThemedText>
          </Pressable>
        </View>
        <Pressable
          onPress={() => {
            const d = new Date();
            setCursor({ year: d.getFullYear(), month: d.getMonth() + 1 });
            setFocusIso(today);
            setDayIso(today);
          }}
          style={styles.todayBtn}
        >
          <ThemedText type="linkPrimary">Hoje</ThemedText>
        </Pressable>
        {projectChips.length > 1 ? (
          <FilterRow>
            <FilterSelect
              label="Projeto"
              value={projectFilter}
              options={projectChips}
              onChange={setProjectFilter}
            />
          </FilterRow>
        ) : null}
        {view !== "month" ? (
          <AgendaHourGrid
            days={view === "week" ? computeWeekDays(focusIso) : [focusIso]}
            byDay={byDay}
            projects={projects}
            onOpenDay={(iso) => {
              setFocusIso(iso);
              setDayIso(iso);
            }}
          />
        ) : null}
        {view === "month" ? (
          <>
        <View style={styles.weekHead}>
          {WEEKDAY_HEADERS.map((label, index) => (
            <ThemedText
              key={`${label}-${index}`}
              type="small"
              themeColor="textSecondary"
              style={styles.weekLabel}
            >
              {label}
            </ThemedText>
          ))}
        </View>
        <View style={styles.grid}>
          {grid.map((cell) => {
            const items = byDay.get(cell.iso) ?? [];
            const visible = items.slice(0, VISIBLE_CHIPS);
            const extra = items.length - visible.length;
            const isToday = cell.iso === today;
            return (
              <Pressable
                key={cell.iso}
                onPress={() => {
                  setFocusIso(cell.iso);
                  setDayIso(cell.iso);
                }}
                style={[
                  styles.day,
                  {
                    backgroundColor: cell.inMonth
                      ? theme.surface
                      : theme.backgroundElement,
                    borderColor: isToday ? theme.primary : theme.backgroundSelected,
                  },
                ]}
              >
                <ThemedText
                  type="smallBold"
                  style={{
                    color: isToday
                      ? theme.primary
                      : cell.inMonth
                        ? theme.text
                        : theme.textSecondary,
                  }}
                >
                  {cell.day}
                </ThemedText>
                {visible.map((item) => (
                  <View
                    key={
                      item.kind === "task" ? item.task.id : `e-${item.event.id}`
                    }
                    style={styles.chip}
                  >
                    <View
                      style={[
                        styles.dot,
                        { backgroundColor: itemColor(item, projects) },
                      ]}
                    />
                    {item.kind === "task" ? (
                      <TaskIconBadge
                        iconKey={item.task.icon_key}
                        iconUrl={item.task.icon_url}
                        size={10}
                      />
                    ) : null}
                    <ThemedText type="small" numberOfLines={1} style={styles.chipText}>
                      {item.kind === "task" && item.task.linked_recurring_id
                        ? `$ ${itemTitle(item)}`
                        : itemTitle(item)}
                    </ThemedText>
                  </View>
                ))}
                {extra > 0 ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    +{extra}
                  </ThemedText>
                ) : null}
              </Pressable>
            );
          })}
        </View>
        <View style={styles.legend}>
          <ThemedText type="small" themeColor="textSecondary">
            Bolinha = status da tarefa · cor do projeto nos eventos · $ em
            pagamento vinculado.
          </ThemedText>
        </View>
          </>
        ) : null}
        <View style={styles.pasteInvite}>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Recebeu um convite de evento? Cole o link"
            placeholderTextColor={theme.textSecondary}
            value={inviteInput}
            onChangeText={setInviteInput}
            onSubmitEditing={openPastedInvite}
            returnKeyType="go"
            style={[
              styles.pasteInput,
              {
                color: theme.text,
                borderColor: theme.backgroundSelected,
                backgroundColor: theme.backgroundElement,
              },
            ]}
          />
          <Pressable
            accessibilityRole="button"
            disabled={!inviteInput.trim()}
            hitSlop={6}
            onPress={openPastedInvite}
          >
            <ThemedText
              type="smallBold"
              style={{ color: inviteInput.trim() ? theme.primary : theme.textSecondary }}
            >
              Abrir
            </ThemedText>
          </Pressable>
        </View>
      </ScrollView>

      <Modal
        visible={dayIso != null}
        transparent
        animationType="fade"
        onRequestClose={() => setDayIso(null)}
      >
        <Pressable style={styles.overlay} onPress={() => setDayIso(null)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: theme.surface }]}
            onPress={() => undefined}
          >
            <ThemedText type="smallBold">
              {dayIso
                ? new Date(`${dayIso}T12:00:00`).toLocaleDateString("pt-BR", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })
                : ""}
            </ThemedText>
            {dayItems.length === 0 ? (
              <ThemedText themeColor="textSecondary">
                Nada neste dia.
              </ThemedText>
            ) : (
              dayItems.map((item) => (
                <Pressable
                  key={item.kind === "task" ? item.task.id : item.event.id}
                  onPress={() => openItem(item)}
                  style={[
                    styles.dayRow,
                    { backgroundColor: theme.backgroundElement },
                  ]}
                >
                  <View
                    style={[
                      styles.dotLg,
                      { backgroundColor: itemColor(item, projects) },
                    ]}
                  />
                  {item.kind === "task" ? (
                    <TaskIconBadge
                      iconKey={item.task.icon_key}
                      iconUrl={item.task.icon_url}
                      size={16}
                    />
                  ) : null}
                  <View style={styles.dayCopy}>
                    <ThemedText type="smallBold">{itemTitle(item)}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {item.kind === "task"
                        ? [
                            TASK_STATUS_LABELS[item.task.status],
                            item.task.due_time?.slice(0, 5),
                            item.task.linked_recurring_id ? "Pagamento" : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")
                        : "Evento de projeto"}
                    </ThemedText>
                  </View>
                  {item.kind === "event" ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Convidar para ${item.event.title}`}
                      hitSlop={8}
                      onPress={() => {
                        setDayIso(null);
                        router.push({
                          pathname: "/tasks/event-invites",
                          params: { eventId: item.event.id, title: item.event.title },
                        });
                      }}
                    >
                      <ThemedText type="small" style={{ color: theme.primary }}>
                        Convidar
                      </ThemedText>
                    </Pressable>
                  ) : null}
                </Pressable>
              ))
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pasteInvite: { flexDirection: "row", alignItems: "center", gap: 10 },
  pasteInput: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: { padding: Spacing.four, gap: Spacing.three },
  monthRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  monthBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  monthTitle: { flex: 1, textAlign: "center" },
  todayBtn: { alignSelf: "center" },
  weekHead: { flexDirection: "row" },
  weekLabel: { flex: 1, textAlign: "center", fontSize: 11 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  day: {
    width: "14.28%",
    minHeight: 78,
    borderWidth: 1,
    padding: 4,
    gap: 2,
  },
  chip: { flexDirection: "row", alignItems: "center", gap: 3 },
  chipText: { flex: 1, fontSize: 10, lineHeight: 12 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  legend: { paddingTop: 4 },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(11,15,26,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: Radius.card,
    borderTopRightRadius: Radius.card,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  dayRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    padding: 12,
  },
  dotLg: { width: 10, height: 10, borderRadius: 5 },
  dayCopy: { flex: 1, gap: 2 },
});
