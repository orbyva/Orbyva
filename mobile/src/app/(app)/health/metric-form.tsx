import { useNavigation, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { recordHealthMetric } from "@/api/health/health";
import { ChoiceChip } from "@/components/ChoiceChip";
import { DateField } from "@/components/DateField";
import { ThemedView } from "@/components/themed-view";
import { Button, Field, Input } from "@/components/ui";
import { Spacing } from "@/constants/theme";
import { getTodayIso } from "@/domain/habits";
import { METRIC_LABEL, METRIC_TYPES, METRIC_UNIT } from "@/domain/health/metrics";
import { useFeedback } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import type { MetricType } from "@/types/health";

export default function MetricFormScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { fail } = useFeedback();
  const [metricType, setMetricType] = useState<MetricType>("weight");
  const [value, setValue] = useState("");
  const [recordedDate, setRecordedDate] = useState(getTodayIso());
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: "Nova medição" });
  }, [navigation]);


  async function onSave() {
    const parsed = Number.parseFloat(value.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      fail("Informe um valor válido.");
      return;
    }
    setSaving(true);
    try {
      await recordHealthMetric({
        metric_type: metricType,
        value: parsed,
        recorded_date: recordedDate,
        notes,
      });
      router.back();
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível salvar a medição."));
    } finally {
      setSaving(false);
    }
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
              {METRIC_TYPES.map((type) => (
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
              autoFocus
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
            label="Registrar medição"
            disabled={saving}
            loading={saving}
            onPress={() => void onSave()}
            size="lg"
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}


const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { padding: Spacing.four, gap: Spacing.three, paddingBottom: 48 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
