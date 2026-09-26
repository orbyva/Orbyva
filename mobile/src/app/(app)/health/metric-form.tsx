import { useNavigation, useRouter } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import { recordHealthMetric } from "@/api/health/health";
import { ChoiceChip } from "@/components/ChoiceChip";
import { DateField } from "@/components/DateField";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { FormButton } from "@/components/ui/FormButton";
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
  const [metricType, setMetricType] = useState<MetricType>("weight");
  const [value, setValue] = useState("");
  const [recordedDate, setRecordedDate] = useState(getTodayIso());
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: "Nova medição" });
  }, [navigation]);

  const inputStyle = [
    styles.input,
    {
      color: theme.text,
      borderColor: theme.backgroundSelected,
      backgroundColor: theme.backgroundElement,
    },
  ];

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
            <TextInput
              autoFocus
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={theme.textSecondary}
              style={inputStyle}
              value={value}
              onChangeText={setValue}
            />
          </Field>
          <Field label="Data">
            <DateField
              value={recordedDate}
              onChange={setRecordedDate}
              style={inputStyle}
              maximumDate={getTodayIso()}
            />
          </Field>
          <Field label="Notas">
            <TextInput
              placeholder="Opcional"
              placeholderTextColor={theme.textSecondary}
              style={inputStyle}
              value={notes}
              onChangeText={setNotes}
            />
          </Field>
          <FormButton
            label="Registrar medição"
            tone="primary"
            disabled={saving}
            busy={saving}
            onPress={() => void onSave()}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <View style={styles.field}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
        {required ? " *" : ""}
      </ThemedText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { padding: Spacing.four, gap: Spacing.three, paddingBottom: 48 },
  field: { gap: 8 },
  input: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    justifyContent: "center",
    fontSize: 16,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  primary: {
    height: 48,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.two,
  },
  primaryLabel: { color: "#0B0F1A" },
});
