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
  createVehicle,
  deleteVehicle,
  fetchVehicleById,
  updateVehicle,
} from "@/api/car/car";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner } from "@/components/ui/Banner";
import { Spacing } from "@/constants/theme";
import { FUEL_TYPE_LABELS, VEHICLE_KIND_LABELS } from "@/domain/car";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import type { FuelType, VehicleKind } from "@/types/car";

const KIND_CHIPS = (Object.keys(VEHICLE_KIND_LABELS) as VehicleKind[]).map(
  (id) => ({ id, label: VEHICLE_KIND_LABELS[id] })
);
const FUEL_CHIPS = (Object.keys(FUEL_TYPE_LABELS) as FuelType[]).map((id) => ({
  id,
  label: FUEL_TYPE_LABELS[id],
}));

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
  const [fuelType, setFuelType] = useState<FuelType>("flex");
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

  const inputStyle = [
    styles.input,
    {
      color: theme.text,
      borderColor: theme.backgroundSelected,
      backgroundColor: theme.backgroundElement,
    },
  ];

  async function onSave() {
    if (!brand.trim() || !model.trim()) {
      fail("Informe marca e modelo.");
      return;
    }
    const currentKm = Number.parseInt(km.replace(/\D/g, ""), 10) || 0;
    const yearNum = year.trim() ? Number.parseInt(year, 10) : null;
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
      >
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          <Banner message={error} />
          <Field label="Tipo">
            <View style={styles.chips}>
              {KIND_CHIPS.map((chip) => (
                <Pressable
                  key={chip.id}
                  onPress={() => setKind(chip.id)}
                  style={[
                    styles.chip,
                    { backgroundColor: theme.backgroundElement },
                    kind === chip.id && {
                      backgroundColor: theme.backgroundSelected,
                    },
                  ]}
                >
                  <ThemedText type="smallBold">{chip.label}</ThemedText>
                </Pressable>
              ))}
            </View>
          </Field>
          <Field label="Marca" required>
            <TextInput
              autoFocus={!editId}
              style={inputStyle}
              value={brand}
              onChangeText={setBrand}
            />
          </Field>
          <Field label="Modelo" required>
            <TextInput style={inputStyle} value={model} onChangeText={setModel} />
          </Field>
          <Field label="Ano">
            <TextInput
              keyboardType="number-pad"
              style={inputStyle}
              value={year}
              onChangeText={setYear}
            />
          </Field>
          <Field label="Placa">
            <TextInput
              autoCapitalize="characters"
              style={inputStyle}
              value={plate}
              onChangeText={setPlate}
            />
          </Field>
          <Field label="Cor">
            <TextInput style={inputStyle} value={color} onChangeText={setColor} />
          </Field>
          <Field label="Km atual">
            <TextInput
              keyboardType="number-pad"
              style={inputStyle}
              value={km}
              onChangeText={setKm}
            />
          </Field>
          <Field label="Combustível">
            <View style={styles.chips}>
              {FUEL_CHIPS.map((chip) => (
                <Pressable
                  key={chip.id}
                  onPress={() => setFuelType(chip.id)}
                  style={[
                    styles.chip,
                    { backgroundColor: theme.backgroundElement },
                    fuelType === chip.id && {
                      backgroundColor: theme.backgroundSelected,
                    },
                  ]}
                >
                  <ThemedText type="smallBold">{chip.label}</ThemedText>
                </Pressable>
              ))}
            </View>
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
          <Pressable
            disabled={saving}
            onPress={() => void onSave()}
            style={[styles.primary, { backgroundColor: theme.primary }]}
          >
            {saving ? (
              <ActivityIndicator color="#0B0F1A" />
            ) : (
              <ThemedText type="smallBold" style={styles.primaryLabel}>
                {editId ? "Salvar alterações" : "Criar veículo"}
              </ThemedText>
            )}
          </Pressable>
          {editId ? (
            <Pressable disabled={saving} onPress={onDelete}>
              <ThemedText themeColor="danger">Excluir veículo</ThemedText>
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
  primary: {
    height: 48,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.two,
  },
  primaryLabel: { color: "#0B0F1A" },
});
