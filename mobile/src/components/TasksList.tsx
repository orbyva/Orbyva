import { Alert, Pressable, StyleSheet, View } from "react-native";

import { TaskIconBadge } from "@/components/TaskIconBadge";
import { ThemedText } from "@/components/themed-text";
import { Card } from "@/components/ui/Card";
import {
  resolveLinkAppearance,
  type LinkIconRuleShape,
} from "@/domain/tasks/linkIconRules";
import { Spacing } from "@/constants/theme";
import { PRIORITY_COLORS } from "@/domain/tasks/priority";
import { taskScheduleMeta, todayIsoDate } from "@/domain/tasks/listView";
import { useTheme } from "@/hooks/use-theme";
import { openExternalUrl } from "@/lib/url";
import type { Task, TaskStatus } from "@/types/tasks";
import { TASK_STATUS_LABELS } from "@/types/tasks";

export function TasksList({
  sections,
  busyId,
  onComplete,
  onReopen,
  onOpen,
  onChangeStatus,
  onToggleTimer,
  runningTaskId,
  linksByTaskId,
  linkRules = [],
  childrenByParent,
  emptyTitle = "Nenhuma tarefa em aberto",
  emptyHint = "Use o + para criar uma com título e prazo.",
}: {
  sections: { id: string; label: string; items: Task[] }[];
  busyId: string | null;
  onComplete: (task: Task) => void;
  onReopen?: (task: Task) => void;
  onOpen?: (task: Task) => void;
  onChangeStatus?: (task: Task, status: TaskStatus) => void;
  onToggleTimer?: (task: Task) => void;
  runningTaskId?: string | null;
  linksByTaskId?: Record<string, { url: string; comment: string | null }>;
  linkRules?: readonly LinkIconRuleShape[];
  childrenByParent?: Record<string, Task[]>;
  emptyTitle?: string;
  emptyHint?: string;
}) {
  const theme = useTheme();
  const visible = sections.filter((section) => section.items.length > 0);

  function pickStatus(task: Task) {
    if (!onChangeStatus) return;
    Alert.alert("Status", task.title, [
      {
        text: TASK_STATUS_LABELS.todo,
        onPress: () => onChangeStatus(task, "todo"),
      },
      {
        text: TASK_STATUS_LABELS.doing,
        onPress: () => onChangeStatus(task, "doing"),
      },
      {
        text: TASK_STATUS_LABELS.done,
        onPress: () => onChangeStatus(task, "done"),
      },
      { text: "Cancelar", style: "cancel" },
    ]);
  }

  if (visible.length === 0) {
    return (
      <View style={styles.empty}>
        <ThemedText type="smallBold">{emptyTitle}</ThemedText>
        <ThemedText themeColor="textSecondary">{emptyHint}</ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.stack}>
      {visible.map((section) => (
        <View key={section.id} style={styles.section}>
          <ThemedText type="small" themeColor="textSecondary">
            {section.label} · {section.items.length}
          </ThemedText>
          <Card>
            {section.items.map((task, index) => {
              const overdue = section.id === "overdue";
              const done = task.status === "done";
              const children = childrenByParent?.[task.id] ?? [];
              const link = linksByTaskId?.[task.id];
              const meta = [
                taskScheduleMeta(task),
                task.recurrence_rule ||
                task.recurrence_origin_id ||
                task.linked_recurring_id
                  ? "Recorrente"
                  : null,
                link?.comment?.trim() || null,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <View
                  key={task.id}
                  style={[
                    index > 0 && {
                      borderTopWidth: StyleSheet.hairlineWidth,
                      borderTopColor: theme.backgroundSelected,
                    },
                  ]}
                >
                  <View style={styles.row}>
                    <Check
                      checked={done}
                      disabled={busyId === task.id}
                      overdue={overdue}
                      busy={busyId === task.id}
                      label={
                        done
                          ? `Reabrir ${task.title}`
                          : `Concluir ${task.title}`
                      }
                      onPress={() => {
                        if (done) onReopen?.(task);
                        else onComplete(task);
                      }}
                      theme={theme}
                    />
                    <Pressable
                      disabled={!onOpen && !onChangeStatus}
                      onPress={() => onOpen?.(task)}
                      onLongPress={() => pickStatus(task)}
                      delayLongPress={280}
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
                          style={[styles.title, done ? styles.childDone : undefined]}
                        >
                          {task.title}
                        </ThemedText>
                      </View>
                      <ThemedText
                        type="small"
                        themeColor="textSecondary"
                        style={overdue ? styles.overdue : undefined}
                      >
                        {meta}
                      </ThemedText>
                    </Pressable>
                    {onToggleTimer &&
                    !done &&
                    !task.is_medication &&
                    !task.is_consultation &&
                    !task.medication_id ? (
                      <Pressable
                        onPress={() => onToggleTimer(task)}
                        hitSlop={8}
                      >
                        <ThemedText type="small" style={{ color: theme.primary }}>
                          {runningTaskId === task.id ? "Parar" : "Live"}
                        </ThemedText>
                      </Pressable>
                    ) : null}
                    {link ? <LinkChip url={link.url} rules={linkRules} /> : null}
                  </View>
                  {children.map((child) => {
                    const childDone = child.status === "done";
                    const childOverdue = Boolean(
                      child.due_date &&
                        child.status !== "done" &&
                        child.due_date < todayIsoDate()
                    );
                    const childLink = linksByTaskId?.[child.id];
                    return (
                      <View key={child.id} style={styles.childRow}>
                        <Check
                          checked={childDone}
                          disabled={busyId === child.id}
                          overdue={childOverdue}
                          busy={busyId === child.id}
                          label={
                            childDone
                              ? `Reabrir ${child.title}`
                              : `Concluir ${child.title}`
                          }
                          onPress={() => {
                            if (childDone) onReopen?.(child);
                            else onComplete(child);
                          }}
                          theme={theme}
                        />
                        <Pressable
                          disabled={!onOpen && !onChangeStatus}
                          onPress={() => onOpen?.(child)}
                          onLongPress={() => pickStatus(child)}
                          delayLongPress={280}
                          style={styles.copy}
                        >
                          <View style={styles.titleRow}>
                            {child.priority ? (
                              <View
                                style={[
                                  styles.prio,
                                  { backgroundColor: PRIORITY_COLORS[child.priority] },
                                ]}
                              />
                            ) : null}
                            <ThemedText
                              numberOfLines={2}
                              style={[
                                styles.title,
                                childDone ? styles.childDone : undefined,
                              ]}
                            >
                              {child.title}
                            </ThemedText>
                          </View>
                          <ThemedText
                            type="small"
                            themeColor="textSecondary"
                            style={childOverdue ? styles.overdue : undefined}
                          >
                            {taskScheduleMeta(child)}
                          </ThemedText>
                        </Pressable>
                        {childLink ? (
                          <LinkChip url={childLink.url} rules={linkRules} />
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              );
            })}
          </Card>
        </View>
      ))}
    </View>
  );
}

function LinkChip({
  url,
  rules,
}: {
  url: string;
  rules: readonly LinkIconRuleShape[];
}) {
  const theme = useTheme();
  const appearance = resolveLinkAppearance(url, rules);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Abrir ${appearance.label}`}
      onPress={() => void openExternalUrl(url)}
      hitSlop={8}
      style={styles.linkChip}
    >
      <TaskIconBadge
        iconKey={appearance.iconKey}
        iconUrl={appearance.iconUrl}
        size={14}
        color={theme.textSecondary}
      />
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
        {appearance.label}
      </ThemedText>
    </Pressable>
  );
}

function Check({
  checked,
  disabled,
  overdue,
  busy,
  label,
  onPress,
  theme,
}: {
  checked: boolean;
  disabled: boolean;
  overdue: boolean;
  busy: boolean;
  label: string;
  onPress: () => void;
  theme: { primary: string; textSecondary: string };
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={[
        styles.check,
        {
          borderColor: overdue ? "#E11D48" : theme.textSecondary,
          backgroundColor: checked ? theme.primary : "transparent",
          opacity: busy ? 0.4 : 1,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  stack: { gap: Spacing.four },
  section: { gap: Spacing.two },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: 14,
  },
  childRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.three,
    paddingLeft: 44,
    paddingRight: Spacing.three,
    paddingBottom: 12,
  },
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
  overdue: { color: "#E11D48" },
  childDone: { textDecorationLine: "line-through", opacity: 0.55 },
  empty: { gap: Spacing.one, paddingVertical: Spacing.four },
  linkChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    maxWidth: 140,
    marginTop: 2,
  },
});
