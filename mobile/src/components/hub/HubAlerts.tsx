import { Pressable, StyleSheet, View } from "react-native";

import type { AppAlert } from "@/domain/alerts";
import { ThemedText } from "@/components/themed-text";
import { Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { hexAlpha } from "@/lib/color";

type HubAlertsProps = {
  alerts: AppAlert[];
  extraCount: number;
  onPressItem: (alert: AppAlert) => void;
};

export function HubAlerts({ alerts, extraCount, onPressItem }: HubAlertsProps) {
  const theme = useTheme();
  const priority = alerts
    .filter((a) => a.severity === "danger" || a.severity === "warning")
    .slice(0, 2);

  return (
    <View style={styles.block}>
      <View style={styles.head}>
        <ThemedText type="smallBold">Pontos de atenção</ThemedText>
        {extraCount > 0 ? (
          <ThemedText type="small" themeColor="mutedForeground">
            +{extraCount} no sino
          </ThemedText>
        ) : null}
      </View>

      {priority.length === 0 ? (
        <View
          style={[
            styles.empty,
            { borderColor: theme.border },
          ]}
        >
          <ThemedText type="smallBold">Tudo em dia</ThemedText>
          <ThemedText type="small" themeColor="mutedForeground">
            Nenhum alerta urgente agora.
          </ThemedText>
        </View>
      ) : (
        <View style={styles.list}>
          {priority.map((alert) => (
            <Pressable
              key={alert.id}
              onPress={() => onPressItem(alert)}
              style={[
                styles.row,
                tintedRow(alert.severity === "danger" ? theme.destructive : theme.warning),
              ]}
            >
              <ThemedText type="smallBold">{alert.title}</ThemedText>
              <ThemedText type="small" themeColor="mutedForeground">
                {alert.message}
              </ThemedText>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

function tintedRow(tone: string) {
  return { backgroundColor: hexAlpha(tone, 0.08), borderColor: hexAlpha(tone, 0.22) };
}

const styles = StyleSheet.create({
  block: { gap: Spacing.two },
  head: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  list: { gap: Spacing.two },
  row: {
    borderRadius: Radius.xl,
    padding: Spacing.three,
    gap: 4,
    borderWidth: 1,
  },
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
