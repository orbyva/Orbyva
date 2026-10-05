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
  createVehicle,
  deleteVehicle,
  fetchVehicleById,
  updateVehicle,
} from "@/api/car/car";
import { ChoiceChip } from "@/components/ChoiceChip";
import { DateField } from "@/components/DateField";
import { ThemedView } from "@/components/themed-view";
import { Banner, Button, Field, FormBlock, Input } from "@/components/ui";
import { Spacing } from "@/constants/theme";
import {
  FUEL_TYPE_LABELS,
  getFuelTypesForKind,
  VEHICLE_KIND_LABELS,
} from "@/domain/car";
import { getTodayIso } from "@/domain/habits";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import type { FuelType, VehicleKind } from "@/types/car";

const KIND_CHIPS = (Object.keys(VEHICLE_KIND_LABELS) as VehicleKind[]).map(
  (id) => ({ id, label: VEHICLE_KIND_LABELS[id] })
);

export default function VehicleFormScreen() {
  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const { fail } = useFeedback();
  const params = useLocalSearchParams<{ id?: string }>();
  const editId =
    typeof params.id === "string" && params.id.length > 0 ? params.id : null;

  const [loading, setLoading] = useState(Boolean(editId));
  const [kind, setKind] = useState<VehicleKind>("car");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [plate, setPlate] = useState("");
  const [color, setColor] = useState("");
  const [km, setKm] = useState("0");
  const [fuelType, setFuelType] = useState<FuelType | null>("flex");
  const [purchaseDate, setPurchaseDate] = useState<string | null>(null);
  const [purchaseValue, setPurchaseValue] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: editId ? "Editar veículo" : "Novo veículo" });
  }, [editId, navigation]);

  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    void fetchVehicleById(editId)
      .then((vehicle) => {
        if (cancelled) return;
        if (!vehicle) {
          setError("Veículo não encontrado.");
          return;
        }
        setKind(vehicle.kind);
        setBrand(vehicle.brand);
        setModel(vehicle.model);
        setYear(vehicle.year != null ? String(vehicle.year) : "");
        setPlate(vehicle.plate ?? "");
        setColor(vehicle.color ?? "");
        setKm(String(vehicle.current_km ?? 0));
        setFuelType(vehicle.fuel_type ?? "flex");
        setPurchaseDate(vehicle.purchase_date ?? null);
        setPurchaseValue(
          vehicle.purchase_value != null ? String(vehicle.purchase_value) : ""
        );
        setNotes(vehicle.notes ?? "");
      })
      .catch((err) => {
        if (!cancelled) {
          setError(getErrorMessage(err, "Não foi possível abrir o veículo."));
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
    if (!brand.trim() || !model.trim()) {
      fail("Informe marca e modelo.");
      return;
    }
    const currentKm = Number.parseInt(km.replace(/\D/g, ""), 10) || 0;
    const yearNum = year.trim() ? Number.parseInt(year, 10) : null;
    const parsedPurchase = Number.parseFloat(purchaseValue.replace(",", "."));
    setSaving(true);
    setError(null);
    const payload = {
      kind,
      brand,
      model,
      year: yearNum && Number.isFinite(yearNum) ? yearNum : null,
      plate,
      color,
      current_km: currentKm,
      fuel_type: fuelType,
      purchase_date: purchaseDate,
      purchase_value:
        Number.isFinite(parsedPurchase) && parsedPurchase > 0
          ? parsedPurchase
          : null,
      notes,
    };
    try {
      if (editId) {
        await updateVehicle({ id: editId, ...payload });
        router.back();
      } else {
        const vehicle = await createVehicle(payload);
        router.replace({ pathname: "/cars/[id]", params: { id: vehicle.id } });
      }
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível salvar o veículo."));
    } finally {
      setSaving(false);
    }
  }

  function onDelete() {
    if (!editId) return;
    Alert.alert("Excluir veículo", `${brand} ${model}`.trim() || "Esse veículo", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: () => {
          void (async () => {
            setSaving(true);
            try {
              await deleteVehicle(editId);
              router.replace("/cars");
            } catch (err) {
              fail(getErrorMessage(err, "Não foi possível excluir."));
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
          <Banner message={error} />
          <FormBlock title="Identificação">
          <Field label="Tipo">
            <View style={styles.chips}>
              {KIND_CHIPS.map((chip) => (
                <ChoiceChip
                  key={chip.id}
                  label={chip.label}
                  active={kind === chip.id}
                  onPress={() => {
                    setKind(chip.id);
                    const allowed = getFuelTypesForKind(chip.id);
                    if (fuelType && !allowed.includes(fuelType)) {
                      setFuelType(null);
                    }
                  }}
                />
              ))}
            </View>
          </Field>
          <Field label="Marca" required>
            <Input
              autoFocus={!editId}
              value={brand}
              onChangeText={setBrand}
            />
          </Field>
          <Field label="Modelo" required>
            <Input value={model} onChangeText={setModel} />
          </Field>
          <Field label="Ano">
            <Input
              keyboardType="number-pad"
              value={year}
              onChangeText={setYear}
            />
          </Field>
          <Field label="Placa">
            <Input
              autoCapitalize="characters"
              value={plate}
              onChangeText={setPlate}
            />
          </Field>
          <Field label="Cor">
            <Input value={color} onChangeText={setColor} />
          </Field>
          </FormBlock>
          <FormBlock title="Uso">
          <Field label="Km atual">
            <Input
              keyboardType="number-pad"
              value={km}
              onChangeText={setKm}
            />
          </Field>
          <Field label="Combustível">
            <View style={styles.chips}>
              {getFuelTypesForKind(kind).map((id) => (
                <ChoiceChip
                  key={id}
                  label={FUEL_TYPE_LABELS[id as FuelType] ?? id}
                  active={fuelType === id}
                  onPress={() => setFuelType(id as FuelType)}
                />
              ))}
            </View>
          </Field>
          </FormBlock>
          <FormBlock title="Dados de compra">
            <Field label="Data de compra">
              <DateField
                value={purchaseDate ?? getTodayIso()}
                onChange={(iso) => setPurchaseDate(iso)}
              />
            </Field>
            <Field label="Valor de compra">
              <Input
                keyboardType="decimal-pad"
                placeholder="Opcional"
                value={purchaseValue}
                onChangeText={setPurchaseValue}
              />
            </Field>
          </FormBlock>
          <FormBlock title="Detalhes">
          <Field label="Notas">
            <Input
              placeholder="Opcional"
              value={notes}
              onChangeText={setNotes}
            />
          </Field>
          </FormBlock>
          <Button
            label={editId ? "Salvar alterações" : "Criar veículo"}
            disabled={saving}
            loading={saving}
            onPress={() => void onSave()}
            size="lg"
          />
          {editId ? (
            <Button
              label="Excluir veículo"
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
