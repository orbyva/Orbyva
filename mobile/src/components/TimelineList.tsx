import { Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Card } from "@/components/ui/Card";
import { ModuleColors, Spacing } from "@/constants/theme";
import { formatShortDate } from "@/domain/timeline";
import { hexAlpha } from "@/lib/color";
import { TIMELINE_MODULE_LABELS } from "@/api/timeline";
import type { TimelineItem } from "@/types/timeline";

type TimelineListProps = {
  items: TimelineItem[];
  onPressItem: (item: TimelineItem) => void;
};

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

function statusLabel(status: TimelineItem["status"]): string | null {
  if (status === "overdue") return "Atrasado";
  if (status === "today") return "Hoje";
  if (status === "completed") return "Feito";
  return null;
}

export function TimelineList({ items, onPressItem }: TimelineListProps) {

  if (items.length === 0) {
    return (
      <ThemedText
        type="small"
        themeColor="textSecondary"
        style={styles.empty}
      >
        Nenhum evento no período.
      </ThemedText>
    );
  }

  return (
    <View style={styles.list}>
      {items.map((item) => {
        const badge = statusLabel(item.status);
        const color = moduleColor(item.module);
        return (
          <Card
            key={item.id}
            style={[
              item.status === "overdue" && styles.overdueBorder,
            ]}
          >
            <Pressable
              onPress={() => onPressItem(item)}
              style={styles.row}
            >
              <View
                style={[
                  styles.moduleBadge,
                  {
                    backgroundColor: hexAlpha(color, 0.12),
                    borderColor: hexAlpha(color, 0.35),
                  },
                ]}
              >
                <ThemedText
                  type="smallBold"
                  style={[styles.moduleLabel, { color }]}
                >
                  {TIMELINE_MODULE_LABELS[item.module]}
                </ThemedText>
              </View>
              <View style={styles.body}>
                <ThemedText type="smallBold" numberOfLines={1}>
                  {item.title}
                </ThemedText>
                {item.subtitle ? (
                  <ThemedText
                    type="small"
                    themeColor="textSecondary"
                    numberOfLines={2}
                  >
                    {item.subtitle}
                  </ThemedText>
                ) : null}
              </View>
              <View style={styles.meta}>
                <ThemedText type="small" themeColor="textSecondary">
                  {formatShortDate(item.date)}
                </ThemedText>
                {badge ? (
                  <ThemedText
                    style={
                      item.status === "overdue"
                        ? styles.overdue
                        : item.status === "today"
                          ? styles.today
                          : styles.done
                    }
                  >
                    {badge}
                  </ThemedText>
                ) : null}
              </View>
            </Pressable>
          </Card>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.two },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 14,
    padding: Spacing.three,
  },
  overdueBorder: {
    borderWidth: 1,
    borderColor: "rgba(225,29,72,0.28)",
  },
  moduleBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 2,
  },
  moduleLabel: { fontSize: 10 },
  body: { flex: 1, minWidth: 0, gap: 2 },
  meta: { alignItems: "flex-end", gap: 4 },
  overdue: { color: "#E11D48", fontSize: 10, fontWeight: "700" },
  today: { color: "#D97706", fontSize: 10, fontWeight: "700" },
  done: { color: "#64748B", fontSize: 10, fontWeight: "700" },
  empty: { textAlign: "center", paddingVertical: Spacing.four },
});
