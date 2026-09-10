import { Pressable, StyleSheet, View } from "react-native";

import type { AppAlert } from "@/domain/alerts";
import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

type HubAlertsProps = {
  alerts: AppAlert[];
  extraCount: number;
  onOpen: () => void;
};

export function HubAlerts({ alerts, extraCount, onOpen }: HubAlertsProps) {
  const theme = useTheme();
  const priority = alerts
    .filter((a) => a.severity === "danger" || a.severity === "warning")
    .slice(0, 2);

  return (
    <View style={styles.block}>
      <View style={styles.head}>
        <ThemedText type="smallBold">Pontos de atenção</ThemedText>
        {extraCount > 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            +{extraCount} no sino
          </ThemedText>
        ) : null}
      </View>

      {priority.length === 0 ? (
        <View
          style={[
            styles.empty,
            { borderColor: theme.backgroundSelected },
          ]}
        >
          <ThemedText type="smallBold">Tudo em dia</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Nenhum alerta urgente agora.
          </ThemedText>
        </View>
      ) : (
        <View style={styles.list}>
          {priority.map((alert) => (
            <Pressable
              key={alert.id}
              onPress={onOpen}
              style={[
                styles.row,
                alert.severity === "danger"
                  ? styles.danger
                  : styles.warning,
              ]}
            >
              <ThemedText type="smallBold">{alert.title}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {alert.message}
              </ThemedText>
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
  list: { gap: Spacing.two },
  row: {
    borderRadius: 14,
    padding: Spacing.three,
    gap: 4,
    borderWidth: 1,
  },
  danger: {
    backgroundColor: "rgba(225,29,72,0.08)",
    borderColor: "rgba(225,29,72,0.22)",
  },
  warning: {
    backgroundColor: "rgba(217,119,6,0.08)",
    borderColor: "rgba(217,119,6,0.22)",
  },
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
