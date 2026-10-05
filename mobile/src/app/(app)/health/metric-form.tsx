import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import {
  deleteHealthMetric,
  fetchHealthMetricById,
  recordHealthMetric,
  updateHealthMetric,
} from "@/api/health/health";
import { ChoiceChip } from "@/components/ChoiceChip";
import { DateField } from "@/components/DateField";
import { ThemedView } from "@/components/themed-view";
import { Button, Field, Input } from "@/components/ui";
import { Spacing } from "@/constants/theme";
import { getTodayIso } from "@/domain/habits";
import { METRIC_LABEL, METRIC_TYPES, METRIC_UNIT } from "@/domain/health/metrics";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import type { MetricType } from "@/types/health";

export default function MetricFormScreen() {
  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const { fail } = useFeedback();
  const params = useLocalSearchParams<{ id?: string }>();
  const editId = typeof params.id === "string" && params.id.length > 0 ? params.id : null;
  const [loading, setLoading] = useState(Boolean(editId));
  const [metricType, setMetricType] = useState<MetricType>("weight");
  const [value, setValue] = useState("");
  const [recordedDate, setRecordedDate] = useState(getTodayIso());
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: editId ? "Editar medição" : "Nova medição" });
  }, [editId, navigation]);

  useEffect(() => {
    if (!editId) return;
    let alive = true;
    void fetchHealthMetricById(editId)
      .then((metric) => {
        if (!alive) return;
        if (!metric) {
          fail("Medição não encontrada.");
          router.back();
          return;
        }
        setMetricType(metric.metric_type);
        setValue(String(metric.value).replace(".", ","));
        setRecordedDate(metric.recorded_date);
        setNotes(metric.notes ?? "");
      })
      .catch((err) => fail(getErrorMessage(err, "Não foi possível abrir a medição.")))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [editId, fail, router]);

  async function onSave() {
    const parsed = Number.parseFloat(value.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      fail("Informe um valor válido.");
      return;
    }
    setSaving(true);
    try {
      if (editId) {
        await updateHealthMetric({ id: editId, value: parsed, recorded_date: recordedDate, notes });
      } else {
        await recordHealthMetric({
          metric_type: metricType,
          value: parsed,
          recorded_date: recordedDate,
          notes,
        });
      }
      router.back();
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível salvar a medição."));
    } finally {
      setSaving(false);
    }
  }

  function onDelete() {
    if (!editId) return;
    Alert.alert("Excluir medição", "Essa ação não tem volta.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: () => {
          void (async () => {
            setSaving(true);
            try {
              await deleteHealthMetric(editId);
              router.back();
            } catch (err) {
              fail(getErrorMessage(err, "Não foi possível excluir a medição."));
              setSaving(false);
            }
          })();
        },
      },
    ]);
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
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          <Field label="Tipo">
            <View style={styles.chips}>
              {(editId ? [metricType] : METRIC_TYPES).map((type) => (
                <ChoiceChip
                  key={type}
                  label={METRIC_LABEL[type]}
                  active={metricType === type}
                  onPress={() => setMetricType(type)}
                />
              ))}
            </View>
          </Field>
          <Field label={`Valor (${METRIC_UNIT[metricType]})`} required>
            <Input
              autoFocus={!editId}
              keyboardType="decimal-pad"
              placeholder="0"
              value={value}
              onChangeText={setValue}
            />
          </Field>
          <Field label="Data">
            <DateField
              value={recordedDate}
              onChange={setRecordedDate}
              maximumDate={getTodayIso()}
            />
          </Field>
          <Field label="Notas">
            <Input
              placeholder="Opcional"
              value={notes}
              onChangeText={setNotes}
            />
          </Field>
          <Button
            label={editId ? "Salvar alterações" : "Registrar medição"}
            disabled={saving}
            loading={saving}
            onPress={() => void onSave()}
            size="lg"
          />
          {editId ? (
            <Button
              label="Excluir medição"
              disabled={saving}
              onPress={onDelete}
              variant="destructive"
            />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: { padding: Spacing.four, gap: Spacing.three, paddingBottom: 48 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
