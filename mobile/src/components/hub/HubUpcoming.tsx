import { Pressable, StyleSheet, View } from "react-native";

import { TIMELINE_MODULE_LABELS } from "@/api/timeline";
import { ThemedText } from "@/components/themed-text";
import { Card } from "@/components/ui";
import { Radius, Spacing, type ModuleColorKey } from "@/constants/theme";
import { formatShortDate } from "@/domain/timeline";
import { TypeScale } from "@/domain/ui/typography";
import { useModuleColors, useTheme } from "@/hooks/use-theme";
import { hexAlpha } from "@/lib/color";
import type { TimelineItem } from "@/types/timeline";

function moduleColorKey(module: TimelineItem["module"]): ModuleColorKey {
  if (module === "tasks") return "productivity";
  if (module === "cinema") return "entertainment";
  if (
    module === "habits" ||
    module === "goals" ||
    module === "travel" ||
    module === "places" ||
    module === "car"
  ) {
    return "life";
  }
  return "finance";
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
  const color = useModuleColors()[moduleColorKey(item.module)];
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
        <ThemedText type="small" themeColor="mutedForeground" numberOfLines={1}>
          {item.subtitle ?? TIMELINE_MODULE_LABELS[item.module]}
        </ThemedText>
      </View>
      <View style={styles.meta}>
        <ThemedText type="small" themeColor="mutedForeground">
          {formatShortDate(item.date)}
        </ThemedText>
        {item.status === "overdue" || item.status === "today" ? (
          <ThemedText
            style={styles.status}
            themeColor={item.status === "overdue" ? "destructive" : "warning"}
          >
            {item.status === "overdue" ? "Atrasado" : "Hoje"}
          </ThemedText>
        ) : item.status === "completed" ? (
          <ThemedText style={styles.status} themeColor="mutedForeground">
            Feito
          </ThemedText>
        ) : null}
      </View>
    </Pressable>
  );
}

type HubUpcomingProps = {
  items: TimelineItem[];
  recent?: TimelineItem[];
  onOpenItem: (item: TimelineItem) => void;
};

export function HubUpcoming({
  items,
  recent = [],
  onOpenItem,
}: HubUpcomingProps) {
  const theme = useTheme();
  const visible = items.slice(0, 5);
  const recentVisible = recent.slice(0, 5);

  return (
    <View style={styles.block}>
      <View style={styles.head}>
        <ThemedText type="smallBold">Agendados</ThemedText>
      </View>

      {visible.length === 0 ? (
        <View
          style={[
            styles.empty,
            { borderColor: theme.border },
          ]}
        >
          <ThemedText type="smallBold">Agenda leve</ThemedText>
          <ThemedText type="small" themeColor="mutedForeground">
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
              borderColor={theme.border}
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
                borderColor={theme.border}
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
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  moduleLabel: TypeScale.nano,
  body: { flex: 1, minWidth: 0, gap: 2 },
  meta: { alignItems: "flex-end", gap: 4 },
  status: TypeScale.nano,
  empty: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: Radius.xl,
    paddingVertical: Spacing.four,
    paddingHorizontal: Spacing.three,
    alignItems: "center",
    gap: 4,
  },
});
