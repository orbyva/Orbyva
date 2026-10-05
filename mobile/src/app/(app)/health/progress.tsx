import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { deleteHealthMetric, fetchHealthMetrics } from "@/api/health/health";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner, Button, ModuleSection } from "@/components/ui";
import { Spacing } from "@/constants/theme";
import {
  bmiCategory,
  computeBmi,
  formatMetricValue,
  latestByType,
  METRIC_LABEL,
  METRIC_TYPES,
  METRIC_UNIT,
  seriesByType,
} from "@/domain/health/metrics";
import { useAppShell } from "@/hooks/use-app-shell";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-toast";
import { formatDateBR } from "@/lib/currency";
import { getErrorMessage } from "@/lib/errors";
import type { HealthMetric } from "@/types/health";

export default function HealthProgressScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { fail, ok } = useFeedback();
  const { bottomInset } = useAppShell();
  const [metrics, setMetrics] = useState<HealthMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setMetrics(await fetchHealthMetrics());
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void load()
        .catch((err) => {
          if (!cancelled) setError(getErrorMessage(err, "Não foi possível carregar as medições."));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [load])
  );

  const latest = useMemo(() => latestByType(metrics), [metrics]);
  const bmi = computeBmi(latest.weight?.value, latest.height?.value);
  const groups = useMemo(
    () =>
      METRIC_TYPES.map((type) => ({ type, rows: seriesByType(metrics, type) })).filter(
        (group) => group.rows.length > 0
      ),
    [metrics]
  );

  function confirmDelete(metric: HealthMetric) {
    Alert.alert(
      "Excluir medição",
      `${METRIC_LABEL[metric.metric_type]} de ${formatDateBR(metric.recorded_date)}`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Excluir",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await deleteHealthMetric(metric.id);
                setMetrics((rows) => rows.filter((row) => row.id !== metric.id));
                ok("Medição excluída");
              } catch (err) {
                fail(getErrorMessage(err, "Não foi possível excluir a medição."));
              }
            })();
          },
        },
      ]
    );
  }

  async function onRefresh() {
    setRefreshing(true);
    try {
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Não foi possível atualizar."));
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator color={theme.primary} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.flex}>
      <ScrollView
        contentContainerStyle={[styles.list, { paddingBottom: bottomInset + 24 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
      >
        <Banner message={error} />
        <Button label="Registrar medição" onPress={() => router.push("/health/metric-form")} />
        {bmi != null ? (
          <ThemedText type="smallBold">
            IMC atual {formatMetricValue(bmi)}
            {bmiCategory(bmi) ? ` · ${bmiCategory(bmi)}` : ""}
          </ThemedText>
        ) : null}
        {groups.length === 0 ? (
          <ThemedText themeColor="mutedForeground">
            Nenhuma medição registrada. Registre peso, altura e medidas para acompanhar a evolução.
          </ThemedText>
        ) : (
          groups.map((group) => (
            <ModuleSection
              key={group.type}
              title={METRIC_LABEL[group.type]}
              icon="pulse-outline"
              tint={theme.chart2}
              badge={String(group.rows.length)}
            >
              {group.rows.map((metric) => (
                <Pressable
                  key={metric.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Editar ${METRIC_LABEL[metric.metric_type]} de ${formatDateBR(metric.recorded_date)}`}
                  onPress={() =>
                    router.push({ pathname: "/health/metric-form", params: { id: metric.id } })
                  }
                  style={styles.row}
                >
                  <View style={styles.rowCopy}>
                    <ThemedText type="smallBold">
                      {formatMetricValue(metric.value)} {METRIC_UNIT[metric.metric_type]}
                    </ThemedText>
                    <ThemedText type="small" themeColor="mutedForeground">
                      {formatDateBR(metric.recorded_date)}
                      {metric.notes ? ` · ${metric.notes}` : ""}
                    </ThemedText>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Excluir medição"
                    hitSlop={8}
                    onPress={() => confirmDelete(metric)}
                  >
                    <Ionicons name="trash-outline" size={18} color={theme.destructive} />
                  </Pressable>
                </Pressable>
              ))}
            </ModuleSection>
          ))
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: Spacing.four, gap: Spacing.three },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  rowCopy: { flex: 1, gap: 2 },
});
