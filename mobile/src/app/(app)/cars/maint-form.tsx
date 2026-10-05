import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
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
import { Button, Field, Input, useInputStyle } from "@/components/ui";
import { Spacing } from "@/constants/theme";
import { getTodayIso } from "@/domain/habits";
import { MAINTENANCE_TYPE_LABELS } from "@/domain/car";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";

export default function MaintenanceFormScreen() {
  const theme = useTheme();
  const inputStyle = useInputStyle().container;
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
              <Input
                value={customType}
                onChangeText={setCustomType}
              />
            </Field>
          ) : null}
          <Field label="Data">
            <DateField value={serviceDate} onChange={setServiceDate} />
          </Field>
          <Field label="Km no serviço">
            <Input
              keyboardType="number-pad"
              value={km}
              onChangeText={setKm}
            />
          </Field>
          <Field label="Custo">
            <Input
              keyboardType="decimal-pad"
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
            <ThemedText type="small" themeColor="mutedForeground">
              Já lançado no extrato — o valor é atualizado ao salvar.
            </ThemedText>
          ) : null}
          <Field label="Próximo km">
            <Input
              keyboardType="number-pad"
              value={nextKm}
              onChangeText={setNextKm}
            />
          </Field>
          <Field label="Próxima data">
            {nextDate ? (
              <>
                <DateField value={nextDate} onChange={setNextDate} />
                <Pressable onPress={() => setNextDate(null)}>
                  <ThemedText type="small" themeColor="mutedForeground">
                    Sem data
                  </ThemedText>
                </Pressable>
              </>
            ) : (
              <Pressable
                onPress={() => setNextDate(getTodayIso())}
                style={inputStyle}
              >
                <ThemedText themeColor="mutedForeground">Definir data</ThemedText>
              </Pressable>
            )}
          </Field>
          <Button
            label={editId ? "Salvar alterações" : "Registrar manutenção"}
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
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: { padding: Spacing.four, gap: Spacing.three, paddingBottom: 48 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
