import { Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { PRIORITY_COLORS, PRIORITY_LABELS } from "@/domain/tasks/priority";
import { useTheme } from "@/hooks/use-theme";
import { formatDateTimeBR } from "@/lib/currency";
import type { Task } from "@/types/tasks";

export function TasksList({
  sections,
  busyId,
  onComplete,
  onReopen,
  onOpen,
  childrenByParent,
  emptyTitle = "Nenhuma tarefa em aberto",
  emptyHint = "Use o + para criar uma com título e prazo.",
}: {
  sections: { id: string; label: string; items: Task[] }[];
  busyId: string | null;
  onComplete: (task: Task) => void;
  onReopen?: (task: Task) => void;
  onOpen?: (task: Task) => void;
  childrenByParent?: Record<string, Task[]>;
  emptyTitle?: string;
  emptyHint?: string;
}) {
  const theme = useTheme();
  const visible = sections.filter((section) => section.items.length > 0);

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
          <View
            style={[
              styles.table,
              {
                borderColor: theme.backgroundSelected,
                backgroundColor: theme.background,
              },
            ]}
          >
            {section.items.map((task, index) => {
              const overdue = section.id === "overdue";
              const children = childrenByParent?.[task.id] ?? [];
              const meta = [
                task.due_date
                  ? formatDateTimeBR(task.due_date, task.due_time)
                  : "Sem prazo",
                task.priority ? PRIORITY_LABELS[task.priority] : null,
                task.recurrence_rule ||
                task.recurrence_origin_id ||
                task.linked_recurring_id
                  ? "Recorrente"
                  : null,
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
                      checked={false}
                      disabled={busyId === task.id}
                      overdue={overdue}
                      busy={busyId === task.id}
                      label={`Concluir ${task.title}`}
                      onPress={() => onComplete(task)}
                      theme={theme}
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
                        <ThemedText numberOfLines={2} style={styles.title}>
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
                  </View>
                  {children.map((child) => {
                    const done = child.status === "done";
                    return (
                      <View key={child.id} style={styles.childRow}>
                        <Check
                          checked={done}
                          disabled={busyId === child.id}
                          overdue={false}
                          busy={busyId === child.id}
                          label={
                            done
                              ? `Reabrir ${child.title}`
                              : `Concluir ${child.title}`
                          }
                          onPress={() => {
                            if (done) onReopen?.(child);
                            else onComplete(child);
                          }}
                          theme={theme}
                        />
                        <Pressable
                          disabled={!onOpen}
                          onPress={() => onOpen?.(child)}
                          style={styles.copy}
                        >
                          <ThemedText
                            numberOfLines={2}
                            style={done ? styles.childDone : undefined}
                          >
                            {child.title}
                          </ThemedText>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              );
            })}
          </View>
        </View>
      ))}
    </View>
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
  table: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    overflow: "hidden",
  },
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
});
