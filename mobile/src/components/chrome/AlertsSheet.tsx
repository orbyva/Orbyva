import { usePathname, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { fetchAppAlerts, type AppAlert } from "@/api/alerts";
import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { useAppShell } from "@/hooks/use-app-shell";
import { useTheme } from "@/hooks/use-theme";

function severityColor(severity: AppAlert["severity"]): string {
  if (severity === "danger") return "#E11D48";
  if (severity === "warning") return "#D97706";
  return "#64748B";
}

export function AlertsSheet() {
  const theme = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const { alertsOpen, setAlertsOpen } = useAppShell();
  const [loading, setLoading] = useState(false);
  const [alerts, setAlerts] = useState<AppAlert[]>([]);

  function close() {
    setAlertsOpen(false);
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setAlerts(await fetchAppAlerts());
    } catch {
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (alertsOpen) void load();
  }, [alertsOpen, load, pathname]);

  return (
    <Modal
      visible={alertsOpen}
      animationType="fade"
      transparent
      onRequestClose={close}
    >
      <Pressable style={styles.overlay} onPress={close}>
        <Pressable
          style={[styles.sheet, { backgroundColor: theme.background }]}
          onPress={() => undefined}
        >
          <View style={styles.head}>
            <ThemedText type="smallBold">Alertas</ThemedText>
            <Pressable onPress={close} hitSlop={8}>
              <ThemedText type="linkPrimary">Fechar</ThemedText>
            </Pressable>
          </View>
          <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
            {loading ? (
              <ActivityIndicator color={theme.primary} />
            ) : alerts.length === 0 ? (
              <ThemedText themeColor="textSecondary">
                Nenhum alerta no momento.
              </ThemedText>
            ) : (
              alerts.map((alert) => (
                <Pressable
                  key={alert.id}
                  onPress={() => {
                    close();
                    router.push(alert.href);
                  }}
                  style={[
                    styles.row,
                    { borderColor: theme.backgroundSelected },
                  ]}
                >
                  <View
                    style={[
                      styles.dot,
                      { backgroundColor: severityColor(alert.severity) },
                    ]}
                  />
                  <View style={styles.rowText}>
                    <ThemedText type="smallBold">{alert.title}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {alert.message}
                    </ThemedText>
                  </View>
                </Pressable>
              ))
            )}
          </ScrollView>
          <Pressable
            onPress={() => {
              close();
              router.push("/home");
            }}
            style={[styles.home, { borderColor: theme.backgroundSelected }]}
          >
            <ThemedText type="smallBold">Ver painel do dia</ThemedText>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(11,15,26,0.45)",
  },
  sheet: {
    maxHeight: "75%",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  body: { maxHeight: 360 },
  row: {
    flexDirection: "row",
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  rowText: { flex: 1, gap: 2 },
  home: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
