import { Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Card } from "@/components/ui/Card";
import { ModuleColors, Spacing } from "@/constants/theme";
import { formatShortDate } from "@/domain/timeline";
import { useTheme } from "@/hooks/use-theme";
import type { TimelineItem } from "@/types/timeline";

function moduleLabel(module: TimelineItem["module"]): string {
  if (module === "tasks") return "Tarefas";
  if (module === "habits") return "Vida";
  if (module === "goals") return "Metas";
  if (module === "travel") return "Viagens";
  if (module === "places") return "Lugares";
  if (module === "car") return "Veículos";
  if (module === "cinema") return "Conteúdo";
  return "Finanças";
}

function moduleColor(module: TimelineItem["module"]): string {
  if (module === "tasks") return ModuleColors.productivity;
  if (module === "cinema") return ModuleColors.entertainment;
  if (
    module === "habits" ||
    module === "goals" ||
    module === "travel" ||
    module === "places" ||
    module === "car"
  ) {
    return ModuleColors.life;
  }
  return ModuleColors.finance;
}

type HubUpcomingProps = {
  items: TimelineItem[];
  onOpenTimeline: () => void;
  onOpenItem: (item: TimelineItem) => void;
};

export function HubUpcoming({
  items,
  onOpenTimeline,
  onOpenItem,
}: HubUpcomingProps) {
  const theme = useTheme();
  const visible = items.slice(0, 5);

  return (
    <View style={styles.block}>
      <View style={styles.head}>
        <ThemedText type="smallBold">Próximos 7 dias</ThemedText>
        <Pressable onPress={onOpenTimeline} hitSlop={8}>
          <ThemedText type="small" style={{ color: theme.primary }}>
            Timeline
          </ThemedText>
        </Pressable>
      </View>

      {visible.length === 0 ? (
        <View
          style={[
            styles.empty,
            { borderColor: theme.backgroundSelected },
          ]}
        >
          <ThemedText type="smallBold">Agenda leve</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Nada nos próximos 7 dias.
          </ThemedText>
        </View>
      ) : (
        <Card>
          {visible.map((item, index) => (
            <Pressable
              key={item.id}
              onPress={() => onOpenItem(item)}
              style={[
                styles.row,
                index > 0 && {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: theme.backgroundSelected,
                },
              ]}
            >
              <View
                style={[styles.dot, { backgroundColor: moduleColor(item.module) }]}
              />
              <View style={styles.body}>
                <ThemedText type="smallBold" numberOfLines={1}>
                  {item.title}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {moduleLabel(item.module)}
                  {item.subtitle ? ` · ${item.subtitle}` : ""}
                </ThemedText>
              </View>
              <View style={styles.meta}>
                <ThemedText type="small" themeColor="textSecondary">
                  {formatShortDate(item.date)}
                </ThemedText>
                {item.status === "overdue" || item.status === "today" ? (
                  <ThemedText
                    style={
                      item.status === "overdue"
                        ? styles.overdue
                        : styles.today
                    }
                  >
                    {item.status === "overdue" ? "Atrasado" : "Hoje"}
                  </ThemedText>
                ) : null}
              </View>
            </Pressable>
          ))}
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: Spacing.two },
  head: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: Spacing.three,
    paddingVertical: 12,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  body: { flex: 1, minWidth: 0, gap: 2 },
  meta: { alignItems: "flex-end", gap: 4 },
  overdue: { color: "#E11D48", fontSize: 10, fontWeight: "700" },
  today: { color: "#D97706", fontSize: 10, fontWeight: "700" },
  empty: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 16,
    paddingVertical: Spacing.four,
    paddingHorizontal: Spacing.three,
    alignItems: "center",
    gap: 4,
  },
});
