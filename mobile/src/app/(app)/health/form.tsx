import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import {
  createMedicationWithDoses,
  deactivateMedication,
  fetchMedicationById,
  reactivateMedication,
  updateMedication,
} from "@/api/health/health";
import { DateField } from "@/components/DateField";
import { TimeField } from "@/components/TimeField";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner } from "@/components/ui/Banner";
import { Spacing } from "@/constants/theme";
import { getTodayIso } from "@/domain/habits";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";

const UNIT_CHIPS = ["comprimido", "gotas", "ml", "mg", "UI"];

export default function MedicationFormScreen() {
  const theme = useTheme();
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

  const inputStyle = [
    styles.input,
    {
      color: theme.text,
      borderColor: theme.backgroundSelected,
      backgroundColor: theme.backgroundElement,
    },
  ];

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
      >
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          <Banner message={error} />
          <Field label="Nome" required>
            <TextInput
              autoFocus={!editId}
              placeholder="Losartana"
              placeholderTextColor={theme.textSecondary}
              style={inputStyle}
              value={name}
              onChangeText={setName}
            />
          </Field>
          <Field label="Dose">
            <TextInput
              keyboardType="decimal-pad"
              placeholder="2"
              placeholderTextColor={theme.textSecondary}
              style={inputStyle}
              value={doseAmount}
              onChangeText={setDoseAmount}
            />
            <View style={styles.chips}>
              {UNIT_CHIPS.map((unit) => (
                <Pressable
                  key={unit}
                  onPress={() => setDoseUnit(unit)}
                  style={[
                    styles.chip,
                    { backgroundColor: theme.backgroundElement },
                    doseUnit === unit && {
                      backgroundColor: theme.backgroundSelected,
                    },
                  ]}
                >
                  <ThemedText type="smallBold">{unit}</ThemedText>
                </Pressable>
              ))}
            </View>
          </Field>
          <Field label="Horários">
            {times.map((time, index) => (
              <View key={`${time}-${index}`} style={styles.timeRow}>
                <TimeField value={time} onChange={(next) => {
                  setTimes((cur) => cur.map((t, i) => (i === index ? next : t)));
                }} style={inputStyle} />
                {times.length > 1 ? (
                  <Pressable
                    onPress={() =>
                      setTimes((cur) => cur.filter((_, i) => i !== index))
                    }
                  >
                    <ThemedText themeColor="danger">Remover</ThemedText>
                  </Pressable>
                ) : null}
              </View>
            ))}
            <Pressable
              onPress={() => setTimes((cur) => [...cur, "20:00"])}
            >
              <ThemedText type="linkPrimary">Adicionar horário</ThemedText>
            </Pressable>
          </Field>
          <Field label="A cada quantos dias">
            <TextInput
              keyboardType="number-pad"
              style={inputStyle}
              value={intervalDays}
              onChangeText={(value) =>
                setIntervalDays(value.replace(/\D/g, "") || "1")
              }
            />
          </Field>
          <Field label="Início">
            <DateField value={startedOn} onChange={setStartedOn} style={inputStyle} />
          </Field>
          <Field label="Término programado">
            {endedOn ? (
              <>
                <DateField value={endedOn} onChange={setEndedOn} style={inputStyle} />
                <Pressable onPress={() => setEndedOn(null)}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Contínuo
                  </ThemedText>
                </Pressable>
              </>
            ) : (
              <Pressable
                onPress={() => setEndedOn(getTodayIso())}
                style={inputStyle}
              >
                <ThemedText themeColor="textSecondary">Definir término</ThemedText>
              </Pressable>
            )}
          </Field>
          <Field label="Instruções">
            <TextInput
              placeholder="Em jejum, etc."
              placeholderTextColor={theme.textSecondary}
              style={inputStyle}
              value={instructions}
              onChangeText={setInstructions}
            />
          </Field>
          <Pressable
            disabled={saving}
            onPress={() => void onSave()}
            style={[styles.primary, { backgroundColor: theme.primary }]}
          >
            {saving ? (
              <ActivityIndicator color="#0B0F1A" />
            ) : (
              <ThemedText type="smallBold" style={styles.primaryLabel}>
                {editId ? "Salvar alterações" : "Criar medicação"}
              </ThemedText>
            )}
          </Pressable>
          {editId ? (
            <Pressable disabled={saving} onPress={onToggleActive}>
              <ThemedText themeColor={active ? "danger" : "textSecondary"}>
                {active ? "Encerrar medicação" : "Reativar medicação"}
              </ThemedText>
            </Pressable>
          ) : null}
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
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
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
  chip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
  },
  primary: {
    height: 48,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.two,
  },
  primaryLabel: { color: "#0B0F1A" },
});
