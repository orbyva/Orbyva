import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, View } from "react-native";

import type { HubDaySummary as HubDaySummaryData } from "@/api/hub";
import { ThemedText } from "@/components/themed-text";
import { Card } from "@/components/ui/Card";
import { Spacing } from "@/constants/theme";
import { formatShortDate } from "@/domain/timeline";
import { useTheme } from "@/hooks/use-theme";

type HubDaySummaryProps = {
  day: HubDaySummaryData;
  onOpenFinance: () => void;
  onOpenTasks: () => void;
};

export function HubDaySummary({ day, onOpenFinance, onOpenTasks }: HubDaySummaryProps) {
  const theme = useTheme();

  return (
    <View style={styles.block}>
      <ThemedText type="smallBold">Resumo do dia</ThemedText>
      <Card>
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
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1, minWidth: 0, gap: 2 },
});
