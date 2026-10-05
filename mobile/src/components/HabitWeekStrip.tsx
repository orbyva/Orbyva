import { Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Radius } from "@/constants/theme";
import { habitAccent } from "@/domain/habits/habitColors";
import { useModuleColors, useTheme } from "@/hooks/use-theme";
import { hexAlpha } from "@/lib/color";
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
  const accent = habitAccent(avoid, useModuleColors().life, theme);
  const doneBg = hexAlpha(accent, 0.18);

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
              { borderColor: theme.border },
              day.completed && {
                backgroundColor: doneBg,
                borderColor: accent,
              },
              day.isToday && !day.completed
                ? { borderColor: theme.primary }
                : null,
            ]}
          >
            <ThemedText
              type="smallBold"
              style={day.completed ? { color: accent } : undefined}
              themeColor={day.completed ? undefined : "mutedForeground"}
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
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
