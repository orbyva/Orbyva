import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import { Alert, Pressable, StyleSheet, View } from "react-native";

import type { HubDaySummary as HubDaySummaryData } from "@/api/hub";
import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { formatShortDate, getTodayIso } from "@/domain/timeline";
import { useTheme } from "@/hooks/use-theme";

type HubDaySummaryProps = {
  day: HubDaySummaryData;
  onOpenFinance: () => void;
  onOpenTasks: () => void;
};

function soon() {
  Alert.alert("Em breve", "Esse módulo ainda não está no app.");
}

function tripLabel(startDate: string): string {
  const today = getTodayIso();
  if (startDate === today) return "Hoje";
  const start = new Date(`${startDate}T12:00:00`);
  const now = new Date(`${today}T12:00:00`);
  const days = Math.round((start.getTime() - now.getTime()) / 86_400_000);
  if (days === 1) return "Amanhã";
  if (days > 1) return `Faltam ${days} dias`;
  return formatShortDate(startDate);
}

export function HubDaySummary({ day, onOpenFinance, onOpenTasks }: HubDaySummaryProps) {
  const theme = useTheme();
  const remaining = Math.max(0, day.habitsCount - day.habitsDone);
  const habitTitle =
    day.habitsCount === 0
      ? "Nenhum hábito ainda"
      : remaining === 0
        ? "Disciplina do dia em dia"
        : `Faltam ${remaining} hábito${remaining === 1 ? "" : "s"} hoje`;
  const poster =
    day.lastMovie?.poster && day.lastMovie.poster !== "N/A"
      ? day.lastMovie.poster
      : null;

  return (
    <View style={styles.block}>
      <ThemedText type="smallBold">Resumo do dia</ThemedText>
      <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
        <Pressable onPress={onOpenTasks} style={styles.row}>
          <View style={[styles.icon, { backgroundColor: "rgba(168,85,247,0.16)" }]}>
            <Ionicons name="checkbox" size={18} color="#A855F7" />
          </View>
          <View style={styles.body}>
            <ThemedText type="smallBold" numberOfLines={1}>
              {day.tasksOverdue > 0
                ? `${day.tasksOverdue} atrasada${day.tasksOverdue === 1 ? "" : "s"}`
                : day.tasksToday > 0
                  ? `${day.tasksToday} para hoje`
                  : "Nenhuma tarefa atrasada"}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Tarefas do dia
            </ThemedText>
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {day.tasksToday + day.tasksOverdue > 0
              ? `${day.tasksToday} hoje`
              : "Abrir"}
          </ThemedText>
        </Pressable>

        <Pressable
          onPress={soon}
          style={[styles.row, { borderTopColor: theme.backgroundSelected, borderTopWidth: StyleSheet.hairlineWidth }]}
        >
          <View style={[styles.icon, { backgroundColor: "rgba(34,163,122,0.16)" }]}>
            <Ionicons name="checkmark-circle" size={18} color="#22A37A" />
          </View>
          <View style={styles.body}>
            <ThemedText type="smallBold" numberOfLines={1}>
              {habitTitle}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Disciplina do dia
            </ThemedText>
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {day.habitsCount === 0 ? "Em breve" : `${day.habitsDone}/${day.habitsCount}`}
          </ThemedText>
        </Pressable>

        {day.nextTrip ? (
          <Pressable
            onPress={soon}
            style={[styles.row, { borderTopColor: theme.backgroundSelected, borderTopWidth: StyleSheet.hairlineWidth }]}
          >
            <View style={[styles.icon, { backgroundColor: "rgba(245,158,11,0.16)" }]}>
              <Ionicons name="airplane" size={18} color="#D97706" />
            </View>
            <View style={styles.body}>
              <ThemedText type="smallBold" numberOfLines={1}>
                {day.nextTrip.title}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Próxima viagem
              </ThemedText>
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              {tripLabel(day.nextTrip.start_date)}
            </ThemedText>
          </Pressable>
        ) : null}

        {day.nextPayment ? (
          <Pressable
            onPress={onOpenFinance}
            style={[styles.row, { borderTopColor: theme.backgroundSelected, borderTopWidth: StyleSheet.hairlineWidth }]}
          >
            <View style={[styles.icon, { backgroundColor: "rgba(225,29,72,0.14)" }]}>
              <Ionicons name="card" size={18} color="#E11D48" />
            </View>
            <View style={styles.body}>
              <ThemedText type="smallBold">Próximo pagamento</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {day.nextPayment.recurring.description}
                {` · ${formatShortDate(day.nextPayment.dueDate)}`}
              </ThemedText>
            </View>
          </Pressable>
        ) : null}

        {day.lastMovie ? (
          <Pressable
            onPress={soon}
            style={[styles.row, { borderTopColor: theme.backgroundSelected, borderTopWidth: StyleSheet.hairlineWidth }]}
          >
            {poster ? (
              <Image source={{ uri: poster }} style={styles.poster} />
            ) : (
              <View style={[styles.icon, { backgroundColor: "rgba(212,107,232,0.16)" }]}>
                <Ionicons name="film" size={18} color="#D46BE8" />
              </View>
            )}
            <View style={styles.body}>
              <ThemedText type="smallBold">Você assistiu</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {day.lastMovie.title}
              </ThemedText>
            </View>
            {day.lastMovie.rating != null ? (
              <ThemedText type="smallBold" style={styles.rating}>
                {day.lastMovie.rating}
              </ThemedText>
            ) : (
              <ThemedText type="small" themeColor="textSecondary">
                Em breve
              </ThemedText>
            )}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: Spacing.two },
  card: { borderRadius: 16, overflow: "hidden" },
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
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  poster: { width: 28, height: 40, borderRadius: 6 },
  body: { flex: 1, minWidth: 0, gap: 2 },
  rating: { color: "#D97706" },
});
