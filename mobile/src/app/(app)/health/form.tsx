import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import {
  createMedicationWithDoses,
  deactivateMedication,
  EndMedicationError,
  fetchMedicationById,
  reactivateMedication,
  updateMedication,
} from "@/api/health/health";
import { ChoiceChip } from "@/components/ChoiceChip";
import { DateField } from "@/components/DateField";
import { TimeField } from "@/components/TimeField";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner, Button, Field, Input, useInputStyle } from "@/components/ui";
import { Spacing } from "@/constants/theme";
import { getTodayIso } from "@/domain/habits";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";

const UNIT_CHIPS = ["comprimido", "gotas", "ml", "mg", "UI"];

export default function MedicationFormScreen() {
  const theme = useTheme();
  const inputStyle = useInputStyle().container;
  const router = useRouter();
  const navigation = useNavigation();
  const { fail, ok } = useFeedback();
  const params = useLocalSearchParams<{ id?: string }>();
  const editId =
    typeof params.id === "string" && params.id.length > 0 ? params.id : null;

  const [loading, setLoading] = useState(Boolean(editId));
  const [name, setName] = useState("");
  const [doseAmount, setDoseAmount] = useState("");
  const [doseUnit, setDoseUnit] = useState("comprimido");
  const [instructions, setInstructions] = useState("");
  const [times, setTimes] = useState<string[]>(["08:00"]);
  const [intervalDays, setIntervalDays] = useState("1");
  const [startedOn, setStartedOn] = useState(getTodayIso());
  const [endedOn, setEndedOn] = useState<string | null>(null);
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({
      title: editId ? "Editar medicação" : "Nova medicação",
    });
  }, [editId, navigation]);

  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    void fetchMedicationById(editId)
      .then((med) => {
        if (cancelled) return;
        if (!med) {
          setError("Medicação não encontrada.");
          return;
        }
        setName(med.name);
        setDoseAmount(med.dose_amount != null ? String(med.dose_amount) : "");
        setDoseUnit(med.dose_unit ?? "comprimido");
        setInstructions(med.instructions ?? "");
        setTimes(med.times.length > 0 ? med.times.map((t) => t.slice(0, 5)) : ["08:00"]);
        setIntervalDays(String(med.interval_days || 1));
        setStartedOn(med.started_on);
        setEndedOn(med.ended_on ?? null);
        setActive(med.active);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(getErrorMessage(err, "Não foi possível abrir a medicação."));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editId]);


  async function onSave() {
    const trimmed = name.trim();
    if (!trimmed) {
      fail("Informe o nome do remédio.");
      return;
    }
    const amount = doseAmount.trim()
      ? Number.parseFloat(doseAmount.replace(",", "."))
      : null;
    const payload = {
      name: trimmed,
      dose_amount: amount != null && Number.isFinite(amount) ? amount : null,
      dose_unit: doseUnit.trim() || null,
      instructions,
      times,
      interval_days: Math.max(1, Number.parseInt(intervalDays, 10) || 1),
      started_on: startedOn,
      ended_on: endedOn,
    };
    setSaving(true);
    setError(null);
    try {
      if (editId) {
        await updateMedication({ id: editId, ...payload });
      } else {
        await createMedicationWithDoses(payload);
      }
      router.back();
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível salvar a medicação."));
    } finally {
      setSaving(false);
    }
  }

  function onToggleActive() {
    if (!editId) return;
    Alert.alert(
      active ? "Encerrar medicação" : "Reativar medicação",
      active
        ? "Doses futuras pendentes saem do calendário. O histórico tomado fica."
        : "A medicação volta a gerar doses.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: active ? "Encerrar" : "Reativar",
          style: active ? "destructive" : "default",
          onPress: () => {
            void (async () => {
              setSaving(true);
              try {
                if (active) await deactivateMedication(editId);
                else await reactivateMedication(editId);
                ok(active ? "Medicação encerrada" : "Medicação reativada");
                router.back();
              } catch (err) {
                fail(getErrorMessage(err, "Não foi possível atualizar."));
                if (err instanceof EndMedicationError && err.stage === "delete") {
                  router.back();
                  return;
                }
                setSaving(false);
              }
            })();
          },
        },
      ]
    );
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
          <Banner message={error} />
          <Field label="Nome" required>
            <Input
              autoFocus={!editId}
              placeholder="Losartana"
              value={name}
              onChangeText={setName}
            />
          </Field>
          <Field label="Dose">
            <Input
              keyboardType="decimal-pad"
              placeholder="2"
              value={doseAmount}
              onChangeText={setDoseAmount}
            />
            <View style={styles.chips}>
              {UNIT_CHIPS.map((unit) => (
                <ChoiceChip
                  key={unit}
                  label={unit}
                  active={doseUnit === unit}
                  onPress={() => setDoseUnit(unit)}
                />
              ))}
            </View>
          </Field>
          <Field label="Horários">
            {times.map((time, index) => (
              <View key={`${time}-${index}`} style={styles.timeRow}>
                <TimeField value={time} onChange={(next) => {
                  setTimes((cur) => cur.map((t, i) => (i === index ? next : t)));
                }} style={{ flex: 1 }} />
                {times.length > 1 ? (
                  <Button
                    label="Remover"
                    onPress={() =>
                      setTimes((cur) => cur.filter((_, i) => i !== index))
                    }
                    variant="destructive"
                    size="sm"
                  />
                ) : null}
              </View>
            ))}
            <Button
              label="Adicionar horário"
              onPress={() => setTimes((cur) => [...cur, "20:00"])}
              variant="outline"
            />
          </Field>
          <Field label="A cada quantos dias">
            <Input
              keyboardType="number-pad"
              value={intervalDays}
              onChangeText={(value) =>
                setIntervalDays(value.replace(/\D/g, "") || "1")
              }
            />
          </Field>
          <Field label="Início">
            <DateField value={startedOn} onChange={setStartedOn} />
          </Field>
          <Field label="Término programado">
            {endedOn ? (
              <>
                <DateField value={endedOn} onChange={setEndedOn} />
                <Pressable onPress={() => setEndedOn(null)}>
                  <ThemedText type="small" themeColor="mutedForeground">
                    Contínuo
                  </ThemedText>
                </Pressable>
              </>
            ) : (
              <Pressable
                onPress={() => setEndedOn(getTodayIso())}
                style={inputStyle}
              >
                <ThemedText themeColor="mutedForeground">Definir término</ThemedText>
              </Pressable>
            )}
          </Field>
          <Field label="Instruções">
            <Input
              placeholder="Em jejum, etc."
              value={instructions}
              onChangeText={setInstructions}
            />
          </Field>
          <Button
            label={editId ? "Salvar alterações" : "Criar medicação"}
            disabled={saving}
            loading={saving}
            onPress={() => void onSave()}
            size="lg"
          />
          {editId ? (
            <Button
              label={active ? "Encerrar medicação" : "Reativar medicação"}
              disabled={saving}
              onPress={onToggleActive}
              variant={active ? "destructive" : "outline"}
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
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
  },
});
