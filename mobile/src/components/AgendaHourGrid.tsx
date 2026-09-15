import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { TaskIconBadge } from "@/components/TaskIconBadge";
import { Radius } from "@/constants/theme";
import {
  layoutTimedItems,
  splitAgendaItems,
  TASK_STATUS_COLORS,
  type CalendarItem,
} from "@/domain/tasks/calendar";
import { useTheme } from "@/hooks/use-theme";
import { TASK_STATUS_LABELS, type Project } from "@/types/tasks";

const HOUR_ROW_PX = 48;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const GRID_HEIGHT = HOUR_ROW_PX * 24;

function itemTitle(item: CalendarItem): string {
  return item.kind === "task" ? item.task.title : item.event.title;
}

function itemColor(item: CalendarItem, projects: Project[]): string {
  if (item.kind === "task") {
    return TASK_STATUS_COLORS[item.task.status] ?? "#64748B";
  }
  const project = projects.find((row) => row.id === item.event.project_id);
  return project?.color || "#A855F7";
}

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

function itemIcon(item: CalendarItem) {
  if (item.kind !== "task") return null;
  return (
    <TaskIconBadge
      iconKey={item.task.icon_key}
      iconUrl={item.task.icon_url}
      size={11}
    />
  );
}

export function AgendaHourGrid({
  days,
  byDay,
  projects,
  onOpenDay,
}: {
  days: string[];
  byDay: Map<string, CalendarItem[]>;
  projects: Project[];
  onOpenDay: (iso: string) => void;
}) {
  const theme = useTheme();
  const colWidth = days.length === 1 ? undefined : 72;

  return (
    <ScrollView
      horizontal={days.length > 1}
      nestedScrollEnabled
      showsHorizontalScrollIndicator={false}
    >
      <View style={{ minWidth: days.length > 1 ? 40 + days.length * 72 : "100%" }}>
        <View style={styles.head}>
          <View style={styles.gutter} />
          {days.map((iso) => {
            const date = new Date(`${iso}T12:00:00`);
            return (
              <Pressable
                key={iso}
                onPress={() => onOpenDay(iso)}
                style={[styles.headCell, colWidth ? { width: colWidth } : styles.headFlex]}
              >
                <ThemedText type="small" themeColor="textSecondary">
                  {date.toLocaleDateString("pt-BR", { weekday: "short" })}
                </ThemedText>
                <ThemedText type="smallBold">{date.getDate()}</ThemedText>
              </Pressable>
            );
          })}
        </View>
        <ScrollView nestedScrollEnabled style={{ maxHeight: 520 }}>
          <View style={{ height: GRID_HEIGHT, flexDirection: "row" }}>
            <View style={styles.gutterCol}>
              {HOURS.map((hour) => (
                <ThemedText
                  key={hour}
                  type="small"
                  themeColor="textSecondary"
                  style={[styles.hour, { height: HOUR_ROW_PX }]}
                >
                  {hourLabel(hour)}
                </ThemedText>
              ))}
            </View>
            {days.map((iso) => {
              const items = byDay.get(iso) ?? [];
              const { timed } = layoutTimedItems(items);
              const { quick, untimed } = splitAgendaItems(items);
              return (
                <Pressable
                  key={iso}
                  onPress={() => onOpenDay(iso)}
                  style={[
                    styles.dayCol,
                    { borderColor: theme.backgroundSelected },
                    colWidth ? { width: colWidth } : styles.headFlex,
                  ]}
                >
                  {HOURS.map((hour) => (
                    <View
                      key={hour}
                      style={[
                        styles.hourLine,
                        { borderColor: theme.backgroundSelected, height: HOUR_ROW_PX },
                      ]}
                    />
                  ))}
                  {untimed.map((item) => (
                    <View
                      key={
                        item.kind === "task"
                          ? `u-${item.task.id}`
                          : `u-${item.event.id}`
                      }
                      pointerEvents="none"
                      style={[
                        styles.untimed,
                        { backgroundColor: theme.backgroundElement },
                      ]}
                    >
                      {itemIcon(item)}
                      <ThemedText type="small" numberOfLines={1}>
                        {itemTitle(item)}
                      </ThemedText>
                    </View>
                  ))}
                  {timed.map((entry) => (
                    <View
                      key={
                        entry.item.kind === "task"
                          ? entry.item.task.id
                          : entry.item.event.id
                      }
                      pointerEvents="none"
                      style={[
                        styles.block,
                        {
                          top: `${entry.topPercent}%`,
                          height: `${Math.max(entry.heightPercent, 3.2)}%`,
                          left: `${entry.leftPercent}%`,
                          width: `${entry.widthPercent}%`,
                          borderLeftColor: itemColor(entry.item, projects),
                          backgroundColor: theme.surface,
                        },
                      ]}
                    >
                      {itemIcon(entry.item)}
                      <ThemedText type="small" numberOfLines={2} style={styles.blockText}>
                        {itemTitle(entry.item)}
                      </ThemedText>
                    </View>
                  ))}
                  {quick.map((task) => {
                    const minutes = task.due_time
                      ? Number(task.due_time.slice(0, 2)) * 60 +
                        Number(task.due_time.slice(3, 5) || 0)
                      : 0;
                    return (
                      <View
                        key={`q-${task.id}`}
                        pointerEvents="none"
                        style={[
                          styles.dot,
                          {
                            top: (minutes / (24 * 60)) * GRID_HEIGHT - 6,
                            backgroundColor:
                              TASK_STATUS_COLORS[task.status] ?? theme.primary,
                          },
                        ]}
                      />
                    );
                  })}
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", marginBottom: 4 },
  gutter: { width: 40 },
  gutterCol: { width: 40 },
  headCell: { alignItems: "center" },
  headFlex: { flex: 1, alignItems: "center" },
  hour: { fontSize: 10, lineHeight: 12 },
  dayCol: {
    flex: 1,
    borderLeftWidth: StyleSheet.hairlineWidth,
    position: "relative",
    height: GRID_HEIGHT,
  },
  hourLine: { borderTopWidth: StyleSheet.hairlineWidth },
  block: {
    position: "absolute",
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderLeftWidth: 3,
    borderRadius: 6,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 3,
  },
  blockText: { fontSize: 10, lineHeight: 12 },
  untimed: {
    position: "absolute",
    top: 2,
    left: 2,
    right: 2,
    borderRadius: Radius.chip,
    paddingHorizontal: 4,
    paddingVertical: 2,
    zIndex: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  dot: {
    position: "absolute",
    left: 6,
    width: 12,
    height: 12,
    borderRadius: 6,
    zIndex: 3,
  },
});
