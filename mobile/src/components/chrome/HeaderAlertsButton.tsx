import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { Radius } from "@/constants/theme";
import { fetchAppAlerts, subscribeAppAlerts } from "@/api/alerts";
import { ThemedText } from "@/components/themed-text";
import { TypeScale } from "@/domain/ui/typography";
import { useAppShell } from "@/hooks/use-app-shell";
import { useTheme } from "@/hooks/use-theme";
import {
  filterVisibleAlerts,
  loadDismissedAlertIds,
  loadEnabledAlertKinds,
} from "@/lib/alertPrefs";
import type { AppAlertKind } from "@/domain/alerts";

export function HeaderAlertsButton() {
  const theme = useTheme();
  const { alertsOpen, setAlertsOpen, setQuickAddOpen, setSearchOpen } = useAppShell();
  const [unread, setUnread] = useState(0);
  const prefs = useRef({
    enabled: new Set<AppAlertKind>(),
    dismissed: new Set<string>(),
  });

  const refreshCount = useCallback(() => {
    void Promise.all([
      fetchAppAlerts(),
      loadEnabledAlertKinds(),
      loadDismissedAlertIds(),
    ])
      .then(([rows, kinds, hidden]) => {
        prefs.current = { enabled: kinds, dismissed: hidden };
        setUnread(filterVisibleAlerts(rows, kinds, hidden).length);
      })
      .catch(() => undefined);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshCount();
      return subscribeAppAlerts((rows) =>
        setUnread(
          filterVisibleAlerts(
            rows,
            prefs.current.enabled,
            prefs.current.dismissed
          ).length
        )
      );
    }, [refreshCount])
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Alertas"
      onPress={() => {
        refreshCount();
        setQuickAddOpen(false);
        setSearchOpen(false);
        setAlertsOpen(!alertsOpen);
      }}
      hitSlop={8}
      style={styles.hit}
    >
      <Ionicons name="notifications-outline" size={22} color={theme.foreground} />
      {unread > 0 ? (
        <View style={[styles.badge, { backgroundColor: theme.destructive }]}>
          <ThemedText style={styles.badgeText} themeColor="destructiveForeground">
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
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: TypeScale.nano,
});
