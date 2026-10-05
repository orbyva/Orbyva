import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, View } from "react-native";

import type { HubDaySummary as HubDaySummaryData, HubHabitToday } from "@/api/hub";
import { ThemedText } from "@/components/themed-text";
import { Card } from "@/components/ui";
import { Radius, Spacing } from "@/constants/theme";
import { formatShortDate } from "@/domain/timeline";
import { useModuleColors, useTheme } from "@/hooks/use-theme";
import { hexAlpha } from "@/lib/color";

type HubDaySummaryProps = {
  day: HubDaySummaryData;
  onOpenFinance: () => void;
  onOpenTasks: () => void;
  onOpenHabits: () => void;
  onOpenMovies: () => void;
  onToggleHabit: (habit: HubHabitToday) => void;
  busyHabitId?: string | null;
};

export function HubDaySummary({
  day,
  onOpenFinance,
  onOpenTasks,
  onOpenHabits,
  onOpenMovies,
  onToggleHabit,
  busyHabitId,
}: HubDaySummaryProps) {
  const theme = useTheme();
  const moduleColors = useModuleColors();

  return (
    <View style={styles.block}>
      <ThemedText type="smallBold">Resumo do dia</ThemedText>
      <Card>
        <Pressable onPress={onOpenTasks} style={styles.row}>
          <View style={[styles.icon, { backgroundColor: hexAlpha(moduleColors.productivity, 0.16) }]}>
            <Ionicons name="checkbox" size={18} color={moduleColors.productivity} />
          </View>
          <View style={styles.body}>
            <ThemedText type="smallBold" numberOfLines={1}>
              {day.tasksOverdue > 0
                ? `${day.tasksOverdue} atrasada${day.tasksOverdue === 1 ? "" : "s"}`
                : day.tasksToday > 0
                  ? `${day.tasksToday} para hoje`
                  : "Nenhuma tarefa atrasada"}
            </ThemedText>
            <ThemedText type="small" themeColor="mutedForeground">
              Tarefas do dia
            </ThemedText>
          </View>
          <ThemedText type="small" themeColor="mutedForeground">
            {day.tasksToday + day.tasksOverdue > 0
              ? `${day.tasksToday} hoje`
              : "Abrir"}
          </ThemedText>
        </Pressable>

        {day.habits.length > 0 ? (
          <View
            style={[
              styles.row,
              {
                borderTopColor: theme.border,
                borderTopWidth: StyleSheet.hairlineWidth,
                alignItems: "flex-start",
              },
            ]}
          >
            <Pressable
              onPress={onOpenHabits}
              style={[styles.icon, { backgroundColor: hexAlpha(moduleColors.life, 0.16) }]}
            >
              <Ionicons name="leaf" size={18} color={moduleColors.life} />
            </Pressable>
            <View style={styles.body}>
              <Pressable onPress={onOpenHabits}>
                <ThemedText type="smallBold">
                  Hábitos {day.habitsDone}/{day.habitsCount}
                </ThemedText>
              </Pressable>
              {day.habits.map((habit) => (
                <Pressable
                  key={habit.id}
                  disabled={busyHabitId === habit.id}
                  onPress={() => onToggleHabit(habit)}
                  style={styles.habitRow}
                >
                  <View
                    style={[
                      styles.habitCheck,
                      {
                        borderColor: habit.done ? theme.success : theme.mutedForeground,
                        backgroundColor: habit.done ? theme.success : "transparent",
                      },
                    ]}
                  />
                  <ThemedText
                    type="small"
                    style={habit.done ? styles.habitDone : undefined}
                    numberOfLines={1}
                  >
                    {habit.name}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {day.lastMovie || day.moviesToWatch > 0 ? (
          <Pressable
            onPress={onOpenMovies}
            style={[
              styles.row,
              {
                borderTopColor: theme.border,
                borderTopWidth: StyleSheet.hairlineWidth,
              },
            ]}
          >
            <View style={[styles.icon, { backgroundColor: hexAlpha(moduleColors.entertainment, 0.16) }]}>
              <Ionicons name="film" size={18} color={moduleColors.entertainment} />
            </View>
            <View style={styles.body}>
              <ThemedText type="smallBold" numberOfLines={1}>
                {day.lastMovie
                  ? day.lastMovie.title
                  : `${day.moviesToWatch} para assistir`}
              </ThemedText>
              <ThemedText type="small" themeColor="mutedForeground">
                {day.lastMovie
                  ? day.moviesToWatch > 0
                    ? `Último filme · ${day.moviesToWatch} na fila`
                    : "Último filme"
                  : "Cinema"}
              </ThemedText>
            </View>
          </Pressable>
        ) : null}

        {day.nextPayment ? (
          <Pressable
            onPress={onOpenFinance}
            style={[styles.row, { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }]}
          >
            <View style={[styles.icon, { backgroundColor: hexAlpha(theme.destructive, 0.14) }]}>
              <Ionicons name="card" size={18} color={theme.destructive} />
            </View>
            <View style={styles.body}>
              <ThemedText type="smallBold">Próximo pagamento</ThemedText>
              <ThemedText type="small" themeColor="mutedForeground" numberOfLines={1}>
                {day.nextPayment.recurring.description}
                {` · ${formatShortDate(day.nextPayment.dueDate)}`}
              </ThemedText>
            </View>
          </Pressable>
        ) : null}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: Spacing.two },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: 12,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: Radius.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1, minWidth: 0, gap: 2 },
  habitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  habitCheck: {
    width: 18,
    height: 18,
    borderRadius: Radius.full,
    borderWidth: 2,
  },
  habitDone: { textDecorationLine: "line-through", opacity: 0.55 },
});
