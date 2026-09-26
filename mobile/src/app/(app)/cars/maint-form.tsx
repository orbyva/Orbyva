import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import {
  createMaintenance,
  fetchMaintenanceById,
  updateMaintenance,
} from "@/api/car/car";
import { DateField } from "@/components/DateField";
import { ChoiceChip } from "@/components/ChoiceChip";
import { LedgerClassField } from "@/components/LedgerClassField";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { FormButton } from "@/components/ui/FormButton";
import { Spacing } from "@/constants/theme";
import { getTodayIso } from "@/domain/habits";
import { MAINTENANCE_TYPE_LABELS } from "@/domain/car";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";

export default function MaintenanceFormScreen() {
  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const { fail } = useFeedback();
  const params = useLocalSearchParams<{ vehicleId?: string; id?: string }>();
  const vehicleId =
    typeof params.vehicleId === "string" ? params.vehicleId : "";
  const editId =
    typeof params.id === "string" && params.id.length > 0 ? params.id : null;
  const [type, setType] = useState("oil");
  const [customType, setCustomType] = useState("");
  const [serviceDate, setServiceDate] = useState(getTodayIso());
  const [km, setKm] = useState("");
  const [cost, setCost] = useState("");
  const [nextKm, setNextKm] = useState("");
  const [nextDate, setNextDate] = useState<string | null>(null);
  const [linkLedger, setLinkLedger] = useState(false);
  const [classId, setClassId] = useState<number | null>(null);
  const [hasLedger, setHasLedger] = useState(false);
  const [loading, setLoading] = useState(Boolean(editId));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    navigation.setOptions({
      title: editId ? "Editar manutenção" : "Nova manutenção",
    });
  }, [editId, navigation]);

  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    void fetchMaintenanceById(editId)
      .then((row) => {
        if (cancelled || !row) return;
        setType(row.type);
        setCustomType(row.custom_type ?? "");
        setServiceDate(row.service_date);
        setKm(row.km_at_service ? String(row.km_at_service) : "");
        setCost(row.cost != null ? String(row.cost) : "");
        setNextKm(row.next_km != null ? String(row.next_km) : "");
        setNextDate(row.next_date ?? null);
        setHasLedger(Boolean(row.transaction_id));
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
    if (!vehicleId && !editId) {
      fail("Veículo não informado.");
      return;
    }
    const kmAt = Number.parseInt(km.replace(/\D/g, ""), 10) || 0;
    const parsedCost = cost.trim()
      ? Number.parseFloat(cost.replace(",", "."))
      : null;
    setSaving(true);
    try {
      const fields = {
        type,
        custom_type: type === "other" ? customType.trim() || null : null,
        service_date: serviceDate,
        km_at_service: kmAt,
        cost: parsedCost,
        next_km: nextKm.trim()
          ? Number.parseInt(nextKm.replace(/\D/g, ""), 10)
          : null,
        next_date: nextDate,
      };
      if (editId) {
        await updateMaintenance({ id: editId, ...fields });
      } else {
        await createMaintenance({
          vehicle_id: vehicleId,
          ...fields,
          classId: linkLedger ? classId : null,
        });
      }
      router.back();
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível salvar a manutenção."));
    } finally {
      setSaving(false);
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
              {Object.entries(MAINTENANCE_TYPE_LABELS).map(([id, label]) => (
                <ChoiceChip
                  key={id}
                  label={label}
                  active={type === id}
                  onPress={() => setType(id)}
                />
              ))}
            </View>
          </Field>
          {type === "other" ? (
            <Field label="Qual serviço">
              <TextInput
                style={inputStyle}
                value={customType}
                onChangeText={setCustomType}
              />
            </Field>
          ) : null}
          <Field label="Data">
            <DateField value={serviceDate} onChange={setServiceDate} style={inputStyle} />
          </Field>
          <Field label="Km no serviço">
            <TextInput
              keyboardType="number-pad"
              style={inputStyle}
              value={km}
              onChangeText={setKm}
            />
          </Field>
          <Field label="Custo">
            <TextInput
              keyboardType="decimal-pad"
              style={inputStyle}
              value={cost}
              onChangeText={setCost}
            />
          </Field>
          {!editId ? (
            <LedgerClassField
              enabled={linkLedger}
              onEnabledChange={setLinkLedger}
              classId={classId}
              onClassIdChange={setClassId}
            />
          ) : hasLedger ? (
            <ThemedText type="small" themeColor="textSecondary">
              Já lançado no extrato — o valor é atualizado ao salvar.
            </ThemedText>
          ) : null}
          <Field label="Próximo km">
            <TextInput
              keyboardType="number-pad"
              style={inputStyle}
              value={nextKm}
              onChangeText={setNextKm}
            />
          </Field>
          <Field label="Próxima data">
            {nextDate ? (
              <>
                <DateField value={nextDate} onChange={setNextDate} style={inputStyle} />
                <Pressable onPress={() => setNextDate(null)}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Sem data
                  </ThemedText>
                </Pressable>
              </>
            ) : (
              <Pressable
                onPress={() => setNextDate(getTodayIso())}
                style={inputStyle}
              >
                <ThemedText themeColor="textSecondary">Definir data</ThemedText>
              </Pressable>
            )}
          </Field>
          <FormButton
            label={editId ? "Salvar alterações" : "Registrar manutenção"}
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
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.field}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
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
  primary: {
    height: 48,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.two,
  },
  primaryLabel: { color: "#0B0F1A" },
});
