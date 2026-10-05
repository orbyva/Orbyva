import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePathname, useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";

import { fetchLastInteractedEntry } from "@/api/tasks/timeEntries";
import { completeTaskApi, fetchTaskById } from "@/api/tasks/tasks";
import { ThemedText } from "@/components/themed-text";
import { Radius } from "@/constants/theme";
import { elapsedSeconds, formatDuration } from "@/domain/tasks/timeTracking";
import { scrim } from "@/domain/ui/color";
import { useActiveTimer } from "@/hooks/use-active-timer";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import {
  liveWidgetMode,
  readLiveWidgetHidden,
  writeLiveWidgetHidden,
} from "@/lib/liveWidgetVisibility";
import { normalizePath, quickAddActionsForPath } from "@/lib/nav";
import type { Task, TaskTimeEntry } from "@/types/tasks";

export function LiveWidget() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const hasQuickAdd =
    quickAddActionsForPath(normalizePath(usePathname())).length > 0;
  const { fail, ok } = useFeedback();
  const { runningEntry, start, stop } = useActiveTimer();
  const [lastEntry, setLastEntry] = useState<TaskTimeEntry | null>(null);
  const [task, setTask] = useState<Task | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [dismissed, setDismissed] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [completing, setCompleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void readLiveWidgetHidden().then((value) => {
      if (!cancelled) setHidden(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setDismissed(false);
  }, [runningEntry?.id]);

  useEffect(() => {
    if (runningEntry) return;
    let cancelled = false;
    void fetchLastInteractedEntry()
      .then((entry) => {
        if (!cancelled) setLastEntry(entry);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [runningEntry]);

  const active = runningEntry ?? lastEntry;

  useEffect(() => {
    if (!active?.task_id) {
      setTask(null);
      return;
    }
    let cancelled = false;
    void fetchTaskById(active.task_id)
      .then((row) => {
        if (!cancelled) setTask(row);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [active?.task_id]);

  useEffect(() => {
    if (!runningEntry) return;
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [runningEntry]);

  const mode = liveWidgetMode({
    hasTask: Boolean(active && task),
    running: Boolean(runningEntry),
    taskDone: task?.status === "done",
    dismissed,
    hidden,
  });
  if (mode === "none" || !task) return null;

  const anchor = {
    bottom: Math.max(insets.bottom, 12) + 12,
    right: hasQuickAdd ? 88 : 16,
  };

  function setHiddenPreference(next: boolean) {
    setHidden(next);
    void writeLiveWidgetHidden(next);
  }

  if (mode === "collapsed") {
    return (
      <Pressable
        onPress={() => setHiddenPreference(false)}
        hitSlop={6}
        style={[
          styles.collapsed,
          anchor,
          { backgroundColor: theme.card, borderColor: theme.border },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Mostrar o timer"
      >
        <Ionicons
          name="timer-outline"
          size={20}
          color={runningEntry ? theme.primary : theme.mutedForeground}
        />
      </Pressable>
    );
  }

  const seconds = runningEntry
    ? elapsedSeconds(
        { taskId: runningEntry.task_id, startedAt: runningEntry.started_at, endedAt: null },
        now
      )
    : 0;

  async function onToggle() {
    if (!task) return;
    try {
      if (runningEntry) await stop();
      else await start(task.id);
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível atualizar o timer."));
    }
  }

  async function onComplete() {
    if (!task || completing) return;
    setCompleting(true);
    try {
      try {
        await stop();
      } catch (err) {
        fail(getErrorMessage(err, "Não foi possível parar o timer."));
        return;
      }
      try {
        await completeTaskApi(task.id);
      } catch (err) {
        fail(getErrorMessage(err, "Timer parado, mas não deu para concluir."));
        return;
      }
      setTask((current) =>
        current && current.id === task.id
          ? { ...current, status: "done" }
          : current
      );
      setDismissed(true);
      ok("Tarefa concluída");
    } finally {
      setCompleting(false);
    }
  }

  return (
    <View
      style={[
        styles.wrap,
        anchor,
        { backgroundColor: theme.card },
      ]}
    >
      <Pressable onPress={() => router.push("/tasks/live")} style={styles.copy}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {task.title}
        </ThemedText>
        <ThemedText type="small" themeColor="mutedForeground">
          {runningEntry ? formatDuration(seconds) : "Retomar"}
        </ThemedText>
      </Pressable>
      {runningEntry ? (
        <Pressable
          onPress={() => void onComplete()}
          disabled={completing}
          hitSlop={6}
          style={styles.iconBtn}
          accessibilityLabel="Parar e concluir"
        >
          <Ionicons name="checkmark" size={18} color={theme.foreground} />
        </Pressable>
      ) : null}
      <Pressable
        onPress={() => void onToggle()}
        disabled={completing}
        style={[styles.action, { backgroundColor: theme.primary }]}
        accessibilityLabel={runningEntry ? "Parar timer" : "Retomar timer"}
      >
        <Ionicons
          name={runningEntry ? "stop" : "play"}
          size={14}
          color={theme.primaryForeground}
        />
      </Pressable>
      <Pressable
        onPress={() => setHiddenPreference(true)}
        hitSlop={8}
        style={styles.iconBtn}
        accessibilityLabel="Esconder o timer"
      >
        <Ionicons name="close" size={18} color={theme.mutedForeground} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 16,
    zIndex: 45,
    borderRadius: Radius.xl,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    shadowColor: scrim(1),
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  collapsed: {
    position: "absolute",
    zIndex: 45,
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: scrim(1),
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  copy: { flex: 1, gap: 2 },
  action: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
});
