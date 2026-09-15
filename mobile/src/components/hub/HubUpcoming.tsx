import { Pressable, StyleSheet, View } from "react-native";

import { TIMELINE_MODULE_LABELS } from "@/api/timeline";
import { ThemedText } from "@/components/themed-text";
import { Card } from "@/components/ui/Card";
import { ModuleColors, Spacing } from "@/constants/theme";
import { formatShortDate } from "@/domain/timeline";
import { useTheme } from "@/hooks/use-theme";
import { hexAlpha } from "@/lib/color";
import type { TimelineItem } from "@/types/timeline";

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

function TimelineRow({
  item,
  onOpenItem,
  showTopBorder,
  borderColor,
}: {
  item: TimelineItem;
  onOpenItem: (item: TimelineItem) => void;
  showTopBorder: boolean;
  borderColor: string;
}) {
  const color = moduleColor(item.module);
  return (
    <Pressable
      onPress={() => onOpenItem(item)}
      style={[
        styles.row,
        showTopBorder && {
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: borderColor,
        },
      ]}
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
        <ThemedText type="smallBold" style={[styles.moduleLabel, { color }]}>
          {TIMELINE_MODULE_LABELS[item.module]}
        </ThemedText>
      </View>
      <View style={styles.body}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {item.title}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {item.subtitle ?? TIMELINE_MODULE_LABELS[item.module]}
        </ThemedText>
      </View>
      <View style={styles.meta}>
        <ThemedText type="small" themeColor="textSecondary">
          {formatShortDate(item.date)}
        </ThemedText>
        {item.status === "overdue" || item.status === "today" ? (
          <ThemedText
            style={item.status === "overdue" ? styles.overdue : styles.today}
          >
            {item.status === "overdue" ? "Atrasado" : "Hoje"}
          </ThemedText>
        ) : item.status === "completed" ? (
          <ThemedText style={styles.done}>Feito</ThemedText>
        ) : null}
      </View>
    </Pressable>
  );
}

type HubUpcomingProps = {
  items: TimelineItem[];
  recent?: TimelineItem[];
  onOpenTimeline: () => void;
  onOpenItem: (item: TimelineItem) => void;
};

export function HubUpcoming({
  items,
  recent = [],
  onOpenTimeline,
  onOpenItem,
}: HubUpcomingProps) {
  const theme = useTheme();
  const visible = items.slice(0, 5);
  const recentVisible = recent.slice(0, 5);

  return (
    <View style={styles.block}>
      <View style={styles.head}>
        <ThemedText type="smallBold">Agendados</ThemedText>
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
            <TimelineRow
              key={item.id}
              item={item}
              onOpenItem={onOpenItem}
              showTopBorder={index > 0}
              borderColor={theme.backgroundSelected}
            />
          ))}
        </Card>
      )}

      {recentVisible.length > 0 ? (
        <>
          <ThemedText type="smallBold">Últimas atividades</ThemedText>
          <Card>
            {recentVisible.map((item, index) => (
              <TimelineRow
                key={item.id}
                item={item}
                onOpenItem={onOpenItem}
                showTopBorder={index > 0}
                borderColor={theme.backgroundSelected}
              />
            ))}
          </Card>
        </>
      ) : null}
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
  moduleBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  moduleLabel: { fontSize: 10 },
  body: { flex: 1, minWidth: 0, gap: 2 },
  meta: { alignItems: "flex-end", gap: 4 },
  overdue: { color: "#E11D48", fontSize: 10, fontWeight: "700" },
  today: { color: "#D97706", fontSize: 10, fontWeight: "700" },
  done: { color: "#64748B", fontSize: 10, fontWeight: "700" },
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
