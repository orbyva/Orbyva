import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { fetchAppAlerts, subscribeAppAlerts } from "@/api/alerts";
import { ThemedText } from "@/components/themed-text";
import { useAppShell } from "@/hooks/use-app-shell";
import { useTheme } from "@/hooks/use-theme";

export function HeaderAlertsButton() {
  const theme = useTheme();
  const { alertsOpen, setAlertsOpen, setQuickAddOpen } = useAppShell();
  const [unread, setUnread] = useState(0);

  const refreshCount = useCallback(() => {
    void fetchAppAlerts()
      .then((rows) => setUnread(rows.length))
      .catch(() => undefined);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshCount();
      return subscribeAppAlerts((rows) => setUnread(rows.length));
    }, [refreshCount])
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Alertas"
      onPress={() => {
        refreshCount();
        setQuickAddOpen(false);
        setAlertsOpen(!alertsOpen);
      }}
      hitSlop={8}
      style={styles.hit}
    >
      <Ionicons name="notifications-outline" size={22} color={theme.text} />
      {unread > 0 ? (
        <View style={styles.badge}>
          <ThemedText style={styles.badgeText}>
            {unread > 9 ? "9+" : unread}
          </ThemedText>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: {
    minWidth: 36,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 4,
  },
  badge: {
    position: "absolute",
    right: 2,
    top: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#E11D48",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: { color: "#fff", fontSize: 9, fontWeight: "700", lineHeight: 12 },
});
