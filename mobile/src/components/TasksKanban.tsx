import Ionicons from "@expo/vector-icons/Ionicons";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";

import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { PRIORITY_COLORS, PRIORITY_LABELS } from "@/domain/tasks/priority";
import { useTheme } from "@/hooks/use-theme";
import { formatDateTimeBR } from "@/lib/currency";
import type { Task, TaskStatus } from "@/types/tasks";
import { TASK_STATUS_LABELS } from "@/types/tasks";

const STATUSES: TaskStatus[] = ["todo", "doing", "done"];

type Rect = { x: number; y: number; w: number; h: number };

function statusAtPoint(
  rects: Map<TaskStatus, Rect>,
  x: number,
  y: number
): TaskStatus | null {
  for (const status of STATUSES) {
    const rect = rects.get(status);
    if (!rect) continue;
    if (
      x >= rect.x &&
      x <= rect.x + rect.w &&
      y >= rect.y &&
      y <= rect.y + rect.h
    ) {
      return status;
    }
  }
  return null;
}

export function TasksKanban({
  columns,
  busyId,
  onComplete,
  onReopen,
  onOpen,
  onMoveStatus,
  childrenByParent,
}: {
  columns: { id: TaskStatus; label: string; items: Task[] }[];
  busyId: string | null;
  onComplete: (task: Task) => void;
  onReopen?: (task: Task) => void;
  onOpen?: (task: Task) => void;
  onMoveStatus: (task: Task, status: TaskStatus) => void;
  childrenByParent?: Record<string, Task[]>;
}) {
  const theme = useTheme();
  const rootRef = useRef<View>(null);
  const columnNodes = useRef(new Map<TaskStatus, View>());
  const columnsRef = useRef(columns);
  columnsRef.current = columns;
  const [dragging, setDragging] = useState<Task | null>(null);

  const absX = useSharedValue(0);
  const absY = useSharedValue(0);
  const originX = useSharedValue(0);
  const originY = useSharedValue(0);
  const ghostVisible = useSharedValue(0);

  const ghostStyle = useAnimatedStyle(() => ({
    opacity: ghostVisible.value,
    transform: [
      { translateX: absX.value - originX.value - 20 },
      { translateY: absY.value - originY.value - 24 },
    ],
  }));

  const measureRoot = useCallback(() => {
    rootRef.current?.measureInWindow((x, y) => {
      originX.value = x;
      originY.value = y;
    });
  }, [originX, originY]);

  const onDragStart = useCallback(
    (id: string) => {
      const task = columnsRef.current
        .flatMap((column) => column.items)
        .find((row) => row.id === id);
      setDragging(task ?? null);
      measureRoot();
    },
    [measureRoot]
  );

  const onDragEnd = useCallback(
    (id: string, x: number, y: number) => {
      const task = columnsRef.current
        .flatMap((column) => column.items)
        .find((row) => row.id === id);
      setDragging(null);
      if (!task) return;

      const entries = [...columnNodes.current.entries()];
      if (entries.length === 0) return;

      let pending = entries.length;
      const rects = new Map<TaskStatus, Rect>();
      const finish = () => {
        const target = statusAtPoint(rects, x, y);
        if (!target || target === task.status) return;
        onMoveStatus(task, target);
      };

      for (const [status, node] of entries) {
        node.measureInWindow((mx, my, w, h) => {
          rects.set(status, { x: mx, y: my, w, h });
          pending -= 1;
          if (pending === 0) finish();
        });
      }
    },
    [onMoveStatus]
  );

  const registerColumn = useCallback((status: TaskStatus, node: View | null) => {
    if (node) columnNodes.current.set(status, node);
    else columnNodes.current.delete(status);
  }, []);

  return (
    <GestureHandlerRootView style={styles.flex}>
      <View
        ref={rootRef}
        collapsable={false}
        style={styles.flex}
        onLayout={measureRoot}
      >
        <View style={styles.stack}>
          {columns.map((column) => (
            <View
              key={column.id}
              ref={(node) => {
                registerColumn(column.id, node);
              }}
              collapsable={false}
              style={[
                styles.column,
                {
                  borderColor: theme.backgroundSelected,
                  backgroundColor: theme.backgroundElement,
                },
              ]}
            >
              <ThemedText type="small" themeColor="textSecondary">
                {column.label} · {column.items.length}
              </ThemedText>
              {column.items.length === 0 ? (
                <ThemedText type="small" themeColor="textSecondary">
                  Solte aqui
                </ThemedText>
              ) : (
                column.items.map((task) => (
                  <KanbanCard
                    key={task.id}
                    task={task}
                    dragging={dragging?.id === task.id}
                    busyId={busyId}
                    absX={absX}
                    absY={absY}
                    ghostVisible={ghostVisible}
                    onDragStart={onDragStart}
                    onDragEnd={onDragEnd}
                    onComplete={onComplete}
                    onReopen={onReopen}
                    onOpen={onOpen}
                    subtasks={childrenByParent?.[task.id] ?? []}
                  />
                ))
              )}
            </View>
          ))}
        </View>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.ghost,
            {
              backgroundColor: theme.background,
              borderColor: theme.primary,
            },
            ghostStyle,
          ]}
        >
          <ThemedText type="smallBold" numberOfLines={2}>
            {dragging?.title ?? TASK_STATUS_LABELS.todo}
          </ThemedText>
        </Animated.View>
      </View>
    </GestureHandlerRootView>
  );
}

const KanbanCard = memo(function KanbanCard({
  task,
  dragging,
  busyId,
  absX,
  absY,
  ghostVisible,
  onDragStart,
  onDragEnd,
  onComplete,
  onReopen,
  onOpen,
  subtasks,
}: {
  task: Task;
  dragging: boolean;
  busyId: string | null;
  absX: SharedValue<number>;
  absY: SharedValue<number>;
  ghostVisible: SharedValue<number>;
  onDragStart: (id: string) => void;
  onDragEnd: (id: string, x: number, y: number) => void;
  onComplete: (task: Task) => void;
  onReopen?: (task: Task) => void;
  onOpen?: (task: Task) => void;
  subtasks: Task[];
}) {
  const theme = useTheme();
  const live = useSharedValue(0);
  const startRef = useRef(onDragStart);
  const endRef = useRef(onDragEnd);
  startRef.current = onDragStart;
  endRef.current = onDragEnd;

  const startJs = useMemo(
    () => (id: string) => {
      startRef.current(id);
    },
    []
  );
  const endJs = useMemo(
    () => (id: string, x: number, y: number) => {
      endRef.current(id, x, y);
    },
    []
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(280)
        .onStart((event) => {
          live.value = 1;
          absX.value = event.absoluteX;
          absY.value = event.absoluteY;
          ghostVisible.value = 1;
          runOnJS(startJs)(task.id);
        })
        .onUpdate((event) => {
          absX.value = event.absoluteX;
          absY.value = event.absoluteY;
        })
        .onFinalize((event) => {
          if (live.value !== 1) return;
          live.value = 0;
          ghostVisible.value = 0;
          runOnJS(endJs)(task.id, event.absoluteX, event.absoluteY);
        }),
    [absX, absY, ghostVisible, live, startJs, endJs, task.id]
  );

  const done = task.status === "done";
  const meta = [
    task.due_date
      ? formatDateTimeBR(task.due_date, task.due_time)
      : "Sem prazo",
    task.priority ? PRIORITY_LABELS[task.priority] : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.background,
          borderColor: theme.backgroundSelected,
          opacity: dragging ? 0.35 : 1,
        },
      ]}
    >
      <View style={styles.row}>
        <GestureDetector gesture={pan}>
          <Animated.View
            accessibilityLabel={`Mover ${task.title}`}
            style={styles.handle}
          >
            <Ionicons
              name="reorder-three-outline"
              size={22}
              color={theme.textSecondary}
            />
          </Animated.View>
        </GestureDetector>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: done }}
          disabled={busyId === task.id}
          onPress={() => {
            if (done) onReopen?.(task);
            else onComplete(task);
          }}
          hitSlop={8}
          style={[
            styles.check,
            {
              borderColor: theme.textSecondary,
              backgroundColor: done ? theme.primary : "transparent",
              opacity: busyId === task.id ? 0.4 : 1,
            },
          ]}
        />
        <Pressable
          disabled={!onOpen}
          onPress={() => onOpen?.(task)}
          style={styles.copy}
        >
          <View style={styles.titleRow}>
            {task.priority ? (
              <View
                style={[
                  styles.prio,
                  { backgroundColor: PRIORITY_COLORS[task.priority] },
                ]}
              />
            ) : null}
            <ThemedText
              numberOfLines={2}
              style={[styles.title, done && styles.doneTitle]}
            >
              {task.title}
            </ThemedText>
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {meta}
          </ThemedText>
        </Pressable>
      </View>
      {subtasks.map((child) => {
        const childDone = child.status === "done";
        return (
          <View key={child.id} style={styles.childRow}>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: childDone }}
              disabled={busyId === child.id}
              onPress={() => {
                if (childDone) onReopen?.(child);
                else onComplete(child);
              }}
              hitSlop={8}
              style={[
                styles.check,
                {
                  borderColor: theme.textSecondary,
                  backgroundColor: childDone ? theme.primary : "transparent",
                },
              ]}
            />
            <Pressable
              disabled={!onOpen}
              onPress={() => onOpen?.(child)}
              style={styles.copy}
            >
              <ThemedText
                numberOfLines={2}
                style={childDone ? styles.doneTitle : undefined}
              >
                {child.title}
              </ThemedText>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  stack: { gap: Spacing.three },
  column: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: Spacing.three,
    gap: Spacing.two,
    minHeight: 88,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.two,
    paddingRight: Spacing.three,
    paddingVertical: 12,
  },
  handle: { paddingHorizontal: 8, paddingVertical: 4 },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    marginTop: 2,
  },
  copy: { flex: 1, gap: 2 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { flex: 1 },
  prio: { width: 8, height: 8, borderRadius: 4 },
  doneTitle: { textDecorationLine: "line-through", opacity: 0.55 },
  childRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.three,
    paddingLeft: 44,
    paddingRight: Spacing.three,
    paddingBottom: 12,
  },
  ghost: {
    position: "absolute",
    left: 0,
    top: 0,
    zIndex: 80,
    maxWidth: 240,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: "#0B0F1A",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
});
