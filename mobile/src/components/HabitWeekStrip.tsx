import { Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Radius } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import type { WeekStripDay } from "@/types/habits";

export function HabitWeekStrip({
  days,
  avoid = false,
  onToggleDay,
}: {
  days: WeekStripDay[];
  avoid?: boolean;
  onToggleDay?: (date: string, nextCompleted: boolean) => void;
}) {
  const theme = useTheme();
  const doneBg = avoid ? "rgba(13,148,136,0.18)" : "rgba(22,163,74,0.18)";
  const doneBorder = avoid ? "#0D9488" : theme.success;
  const doneColor = avoid ? "#0F766E" : theme.success;

  return (
    <View style={styles.row} accessibilityLabel="Semana Seg–Dom">
      {days.map((day) => {
        const interactive = Boolean(onToggleDay);
        return (
          <Pressable
            key={day.date}
            disabled={!interactive}
            onPress={() => onToggleDay?.(day.date, !day.completed)}
            style={[
              styles.cell,
              { borderColor: theme.backgroundSelected },
              day.completed && {
                backgroundColor: doneBg,
                borderColor: doneBorder,
              },
              day.isToday && !day.completed
                ? { borderColor: theme.primary }
                : null,
            ]}
          >
            <ThemedText
              type="smallBold"
              style={day.completed ? { color: doneColor } : undefined}
              themeColor={day.completed ? undefined : "textSecondary"}
            >
              {day.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 6 },
  cell: {
    flex: 1,
    minHeight: 36,
    borderRadius: Radius.control,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
