import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { DateField } from "@/components/DateField";
import { ChoiceChip } from "@/components/ChoiceChip";
import { ThemedText } from "@/components/themed-text";
import { FormButton } from "@/components/ui/FormButton";
import { Spacing } from "@/constants/theme";
import { PRIORITY_COLORS, PRIORITY_OPTIONS } from "@/domain/tasks/priority";
import { isSubtaskDueDateValid } from "@/domain/tasks/subtasks";
import { useTheme } from "@/hooks/use-theme";
import { formatDateBR } from "@/lib/currency";
import type { Task, TaskPriority } from "@/types/tasks";

export function SubtaskFormRow({
  task,
  parentDueDate,
  todayIso,
  busy,
  onToggle,
  onChangeTitle,
  onRename,
  onOpen,
  onDelete,
  onDueChange,
  onPriorityChange,
}: {
  task: Task;
  parentDueDate: string | null;
  todayIso: string;
  busy: boolean;
  onToggle: () => void;
  onChangeTitle: (title: string) => void;
  onRename: (title: string) => void;
  onOpen: () => void;
  onDelete: () => void;
  onDueChange: (dueDate: string | null) => void;
  onPriorityChange: (priority: TaskPriority | null) => void;
}) {
  const theme = useTheme();
  const done = task.status === "done";
  const dueError =
    parentDueDate && !isSubtaskDueDateValid(task.due_date, parentDueDate)
      ? `O prazo não pode passar de ${formatDateBR(parentDueDate)}.`
      : null;
  const inputStyle = {
    color: theme.text,
    borderColor: theme.backgroundSelected,
    backgroundColor: theme.backgroundElement,
  };

  return (
    <View style={styles.block}>
      <View style={styles.top}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: done }}
          disabled={busy}
          onPress={onToggle}
          style={[
            styles.check,
            {
              borderColor: theme.textSecondary,
              backgroundColor: done ? theme.primary : "transparent",
              opacity: busy ? 0.4 : 1,
            },
          ]}
        />
        <TextInput
          style={[
            styles.title,
            inputStyle,
            done ? styles.done : undefined,
          ]}
          value={task.title}
          onChangeText={onChangeTitle}
          onEndEditing={(event) => onRename(event.nativeEvent.text)}
          returnKeyType="done"
        />
        <FormButton label="Abrir" compact onPress={onOpen} />
        <FormButton label="Excluir" tone="danger" compact onPress={onDelete} />
      </View>

      <View style={styles.meta}>
        {task.priority ? (
          <View
            style={[
              styles.dot,
              { backgroundColor: PRIORITY_COLORS[task.priority] },
            ]}
          />
        ) : null}
        <View style={styles.chips}>
          <ChoiceChip
            label="Hoje"
            active={task.due_date === todayIso}
            onPress={() =>
              onDueChange(
                parentDueDate && todayIso > parentDueDate
                  ? parentDueDate
                  : todayIso
              )
            }
          />
          <ChoiceChip
            label="Sem prazo"
            active={task.due_date == null}
            onPress={() => onDueChange(null)}
          />
        </View>
      </View>

      {task.due_date ? (
        <DateField
          value={task.due_date}
          onChange={onDueChange}
          maximumDate={parentDueDate}
          style={[styles.date, inputStyle]}
        />
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          Sem prazo — a subtarefa fica na inbox.
        </ThemedText>
      )}

      {dueError ? (
        <ThemedText type="small" themeColor="danger">
          {dueError}
        </ThemedText>
      ) : parentDueDate ? (
        <ThemedText type="small" themeColor="textSecondary">
          No máximo {formatDateBR(parentDueDate)} (tarefa principal).
        </ThemedText>
      ) : null}

      <View style={styles.chips}>
        {PRIORITY_OPTIONS.map(([value, label]) => (
          <ChoiceChip
            key={label}
            label={label}
            active={(task.priority ?? null) === value}
            onPress={() => onPriorityChange(value)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: Spacing.two },
  top: { flexDirection: "row", alignItems: "center", gap: 10 },
  check: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
  },
  title: {
    flex: 1,
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    fontSize: 16,
  },
  done: { textDecorationLine: "line-through", opacity: 0.55 },
  meta: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, flex: 1 },
  date: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    justifyContent: "center",
  },
});
