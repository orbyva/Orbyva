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
  createTrip,
  deleteTrip,
  fetchTripById,
  fetchTripStops,
  updateTrip,
  type TripStopDraft,
} from "@/api/travel/travel";
import { DateField } from "@/components/DateField";
import { PlaceCatalogSearch } from "@/components/PlaceCatalogSearch";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner } from "@/components/ui/Banner";
import { Spacing } from "@/constants/theme";
import { getTodayIso } from "@/domain/habits";
import { TRIP_STATUS_LABELS } from "@/domain/travel";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import type { TripStatus } from "@/types/travel";

const STATUS_CHIPS = (Object.keys(TRIP_STATUS_LABELS) as TripStatus[]).map(
  (id) => ({ id, label: TRIP_STATUS_LABELS[id] })
);

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function TripFormScreen() {
  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const { fail } = useFeedback();
  const params = useLocalSearchParams<{ id?: string }>();
  const editId =
    typeof params.id === "string" && params.id.length > 0 ? params.id : null;

  const today = getTodayIso();
  const [loading, setLoading] = useState(Boolean(editId));
  const [title, setTitle] = useState("");
  const [destination, setDestination] = useState("");
  const [destLat, setDestLat] = useState<number | null>(null);
  const [destLng, setDestLng] = useState<number | null>(null);
  const [destPlaceId, setDestPlaceId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(addDays(today, 3));
  const [status, setStatus] = useState<TripStatus>("planning");
  const [notes, setNotes] = useState("");
  const [budget, setBudget] = useState("");
  const [stops, setStops] = useState<TripStopDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: editId ? "Editar viagem" : "Nova viagem" });
  }, [editId, navigation]);

  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    void Promise.all([fetchTripById(editId), fetchTripStops(editId)])
      .then(([trip, nextStops]) => {
        if (cancelled) return;
        if (!trip) {
          setError("Viagem não encontrada.");
          return;
        }
        setTitle(trip.title);
        setDestination(trip.destination ?? "");
        setDestLat(trip.destination_lat ?? null);
        setDestLng(trip.destination_lng ?? null);
        setDestPlaceId(trip.destination_place_id ?? null);
        setStartDate(trip.start_date);
        setEndDate(trip.end_date);
        setStatus(trip.status);
        setNotes(trip.notes ?? "");
        setBudget(trip.budget != null ? String(trip.budget) : "");
        setStops(
          nextStops.map((stop) => ({
            name: stop.name,
            start_date: stop.start_date,
            end_date: stop.end_date,
            place_id: stop.place_id ?? null,
            lat: stop.lat ?? null,
            lng: stop.lng ?? null,
          }))
        );
      })
      .catch((err) => {
        if (!cancelled) {
          setError(getErrorMessage(err, "Não foi possível abrir a viagem."));
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
    const trimmed = title.trim();
    if (!trimmed) {
      fail("Informe o título da viagem.");
      return;
    }
    if (endDate < startDate) {
      fail("A data final precisa ser depois do início.");
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      title: trimmed,
      destination,
      destination_lat: destLat,
      destination_lng: destLng,
      destination_place_id: destPlaceId,
      start_date: startDate,
      end_date: endDate,
      status,
      notes,
      budget: budget.trim() ? Number(budget.replace(",", ".")) || null : null,
      stops,
    };
    try {
      if (editId) {
        await updateTrip({ id: editId, ...payload });
        router.back();
      } else {
        const trip = await createTrip(payload);
        router.replace({ pathname: "/travel/[id]", params: { id: trip.id } });
      }
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível salvar a viagem."));
    } finally {
      setSaving(false);
    }
  }

  function onDelete() {
    if (!editId) return;
    Alert.alert("Excluir viagem", title || "Essa viagem", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: () => {
          void (async () => {
            setSaving(true);
            try {
              await deleteTrip(editId);
              router.replace("/travel");
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
          <Field label="Título" required>
            <TextInput
              autoFocus={!editId}
              placeholder="Férias em Lisboa"
              placeholderTextColor={theme.textSecondary}
              style={inputStyle}
              value={title}
              onChangeText={setTitle}
            />
          </Field>
          <Field label="Destino">
            <PlaceCatalogSearch
              placeholder="Buscar cidade"
              scope="regions"
              requestUserLocation={false}
              onPick={(hit) => {
                setDestination(hit.name);
                setDestLat(hit.lat);
                setDestLng(hit.lng);
                setDestPlaceId(hit.google_place_id);
              }}
            />
            <TextInput
              placeholder="Opcional"
              placeholderTextColor={theme.textSecondary}
              style={inputStyle}
              value={destination}
              onChangeText={setDestination}
            />
          </Field>
          <Field label="Início">
            <DateField value={startDate} onChange={setStartDate} style={inputStyle} />
          </Field>
          <Field label="Fim">
            <DateField value={endDate} onChange={setEndDate} style={inputStyle} />
          </Field>
          <Field label="Orçamento">
            <TextInput
              keyboardType="decimal-pad"
              placeholder="Opcional"
              placeholderTextColor={theme.textSecondary}
              style={inputStyle}
              value={budget}
              onChangeText={setBudget}
            />
          </Field>
          <Field label="Status">
            <View style={styles.chips}>
              {STATUS_CHIPS.map((chip) => (
                <Pressable
                  key={chip.id}
                  onPress={() => setStatus(chip.id)}
                  style={[
                    styles.chip,
                    { backgroundColor: theme.backgroundElement },
                    status === chip.id && {
                      backgroundColor: theme.backgroundSelected,
                    },
                  ]}
                >
                  <ThemedText type="smallBold">{chip.label}</ThemedText>
                </Pressable>
              ))}
            </View>
          </Field>
          <Field label="Paradas">
            {stops.map((stop, index) => (
              <View key={`${stop.name}-${index}`} style={styles.stop}>
                <PlaceCatalogSearch
                  placeholder="Buscar parada"
                  scope="regions"
                  requestUserLocation={false}
                  onPick={(hit) =>
                    setStops((cur) =>
                      cur.map((row, i) =>
                        i === index
                          ? {
                              ...row,
                              name: hit.name,
                              place_id: hit.google_place_id,
                              lat: hit.lat,
                              lng: hit.lng,
                            }
                          : row
                      )
                    )
                  }
                />
                <TextInput
                  placeholder="Cidade"
                  placeholderTextColor={theme.textSecondary}
                  style={inputStyle}
                  value={stop.name}
                  onChangeText={(value) =>
                    setStops((cur) =>
                      cur.map((row, i) =>
                        i === index ? { ...row, name: value } : row
                      )
                    )
                  }
                />
                <DateField
                  value={stop.start_date}
                  onChange={(value) =>
                    setStops((cur) =>
                      cur.map((row, i) =>
                        i === index ? { ...row, start_date: value } : row
                      )
                    )
                  }
                  style={inputStyle}
                />
                <DateField
                  value={stop.end_date}
                  onChange={(value) =>
                    setStops((cur) =>
                      cur.map((row, i) =>
                        i === index ? { ...row, end_date: value } : row
                      )
                    )
                  }
                  style={inputStyle}
                />
                <Pressable
                  onPress={() =>
                    setStops((cur) => cur.filter((_, i) => i !== index))
                  }
                >
                  <ThemedText themeColor="danger">Remover parada</ThemedText>
                </Pressable>
              </View>
            ))}
            <Pressable
              onPress={() =>
                setStops((cur) => [
                  ...cur,
                  { name: "", start_date: startDate, end_date: endDate },
                ])
              }
            >
              <ThemedText type="linkPrimary">Adicionar parada</ThemedText>
            </Pressable>
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
                {editId ? "Salvar alterações" : "Criar viagem"}
              </ThemedText>
            )}
          </Pressable>
          {editId ? (
            <Pressable disabled={saving} onPress={onDelete}>
              <ThemedText themeColor="danger">Excluir viagem</ThemedText>
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
  stop: { gap: 8, marginBottom: Spacing.two },
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
