import { Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ModuleColors, Spacing } from "@/constants/theme";
import { formatShortDate } from "@/domain/timeline";
import { useTheme } from "@/hooks/use-theme";
import type { TimelineItem } from "@/types/timeline";

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
        <View
          style={[
            styles.card,
            { backgroundColor: theme.backgroundElement },
          ]}
        >
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
                style={[styles.dot, { backgroundColor: ModuleColors.finance }]}
              />
              <View style={styles.body}>
                <ThemedText type="smallBold" numberOfLines={1}>
                  {item.title}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  Finanças{item.subtitle ? ` · ${item.subtitle}` : ""}
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
        </View>
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
  card: { borderRadius: 16, overflow: "hidden" },
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
