import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
} from "react-native";

import { createFuelLog, fetchFuelLogById, updateFuelLog } from "@/api/car/car";
import { DateField } from "@/components/DateField";
import { LedgerClassField } from "@/components/LedgerClassField";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Button, Field, Input } from "@/components/ui";
import { Spacing } from "@/constants/theme";
import { getTodayIso } from "@/domain/habits";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";

export default function FuelFormScreen() {
  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const { fail } = useFeedback();
  const params = useLocalSearchParams<{ vehicleId?: string; id?: string }>();
  const vehicleId =
    typeof params.vehicleId === "string" ? params.vehicleId : "";
  const editId =
    typeof params.id === "string" && params.id.length > 0 ? params.id : null;
  const [date, setDate] = useState(getTodayIso());
  const [liters, setLiters] = useState("");
  const [totalCost, setTotalCost] = useState("");
  const [km, setKm] = useState("");
  const [station, setStation] = useState("");
  const [linkLedger, setLinkLedger] = useState(false);
  const [classId, setClassId] = useState<number | null>(null);
  const [hasLedger, setHasLedger] = useState(false);
  const [loading, setLoading] = useState(Boolean(editId));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    navigation.setOptions({
      title: editId ? "Editar abastecimento" : "Abastecimento",
    });
  }, [editId, navigation]);

  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    void fetchFuelLogById(editId)
      .then((row) => {
        if (cancelled || !row) return;
        setDate(row.date);
        setLiters(String(row.liters));
        setTotalCost(String(row.total_cost));
        setKm(String(row.km));
        setStation(row.station ?? "");
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
    const litersNum = Number.parseFloat(liters.replace(",", "."));
    const costNum = Number.parseFloat(totalCost.replace(",", "."));
    const kmNum = Number.parseInt(km.replace(/\D/g, ""), 10) || 0;
    if (!Number.isFinite(litersNum) || litersNum <= 0 || !Number.isFinite(costNum)) {
      fail("Informe litros e valor.");
      return;
    }
    setSaving(true);
    try {
      const fields = {
        date,
        liters: litersNum,
        total_cost: costNum,
        km: kmNum,
        station: station.trim() || null,
      };
      if (editId) {
        await updateFuelLog({ id: editId, ...fields });
      } else {
        await createFuelLog({
          vehicle_id: vehicleId,
          ...fields,
          classId: linkLedger ? classId : null,
        });
      }
      router.back();
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível salvar o abastecimento."));
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
          <Field label="Data">
            <DateField value={date} onChange={setDate} />
          </Field>
          <Field label="Litros">
            <Input
              keyboardType="decimal-pad"
              value={liters}
              onChangeText={setLiters}
            />
          </Field>
          <Field label="Valor">
            <Input
              keyboardType="decimal-pad"
              value={totalCost}
              onChangeText={setTotalCost}
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
          <Field label="Km no painel">
            <Input
              keyboardType="number-pad"
              value={km}
              onChangeText={setKm}
            />
          </Field>
          <Field label="Posto">
            <Input
              placeholder="Opcional"
              value={station}
              onChangeText={setStation}
            />
          </Field>
          <Button
            label={editId ? "Salvar alterações" : "Registrar abastecimento"}
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
});
