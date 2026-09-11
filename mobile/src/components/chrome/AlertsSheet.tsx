import { usePathname, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import {
  clearDismissedAlertIds,
  dismissAlertId,
  filterVisibleAlerts,
  loadDismissedAlertIds,
  loadEnabledAlertKinds,
} from "@/lib/alertPrefs";
import type { AppAlertKind } from "@/domain/alerts";

function severityColor(severity: AppAlert["severity"]): string {
  if (severity === "danger") return "#E11D48";
  if (severity === "warning") return "#D97706";
  if (severity === "success") return "#16A34A";
  return "#64748B";
}

export function AlertsSheet() {
  const theme = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const { alertsOpen, setAlertsOpen } = useAppShell();
  const [loading, setLoading] = useState(false);
  const [alerts, setAlerts] = useState<AppAlert[]>([]);
  const [enabled, setEnabled] = useState<Set<AppAlertKind>>(new Set());
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  function close() {
    setAlertsOpen(false);
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, kinds, hidden] = await Promise.all([
        fetchAppAlerts(),
        loadEnabledAlertKinds(),
        loadDismissedAlertIds(),
      ]);
      setAlerts(rows);
      setEnabled(kinds);
      setDismissed(hidden);
    } catch {
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (alertsOpen) void load();
  }, [alertsOpen, load, pathname]);

  const visible = useMemo(
    () => filterVisibleAlerts(alerts, enabled, dismissed),
    [alerts, enabled, dismissed]
  );

  async function onDismiss(id: string) {
    setDismissed(await dismissAlertId(id));
  }

  async function onRestore() {
    await clearDismissedAlertIds();
    setDismissed(new Set());
  }

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
            ) : visible.length === 0 ? (
              <ThemedText themeColor="textSecondary">
                Nenhum alerta no momento.
              </ThemedText>
            ) : (
              visible.map((alert) => (
                <View
                  key={alert.id}
                  style={[styles.row, { borderColor: theme.backgroundSelected }]}
                >
                  <Pressable
                    onPress={() => {
                      close();
                      router.push(alert.href);
                    }}
                    style={styles.rowText}
                  >
                    <ThemedText type="smallBold">{alert.title}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {alert.message}
                    </ThemedText>
                  </Pressable>
                  <Pressable onPress={() => void onDismiss(alert.id)} hitSlop={8}>
                    <ThemedText type="small" themeColor="textSecondary">
                      Dispensar
                    </ThemedText>
                  </Pressable>
                  <View
                    style={[
                      styles.dot,
                      { backgroundColor: severityColor(alert.severity) },
                    ]}
                  />
                </View>
              ))
            )}
          </ScrollView>
          {dismissed.size > 0 ? (
            <Pressable onPress={() => void onRestore()} style={styles.restore}>
              <ThemedText type="smallBold">Restaurar dispensados</ThemedText>
            </Pressable>
          ) : null}
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
    alignItems: "flex-start",
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  rowText: { flex: 1, gap: 2 },
  restore: { alignItems: "center", paddingVertical: 4 },
  home: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
