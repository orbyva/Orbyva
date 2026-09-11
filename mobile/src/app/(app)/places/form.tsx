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
  createPlace,
  deletePlace,
  fetchPlaceById,
  updatePlace,
} from "@/api/places/places";
import { fetchTrips } from "@/api/travel/travel";
import { DateField } from "@/components/DateField";
import { LedgerClassField } from "@/components/LedgerClassField";
import { PlaceCatalogSearch } from "@/components/PlaceCatalogSearch";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner } from "@/components/ui/Banner";
import { Spacing } from "@/constants/theme";
import { getTodayIso } from "@/domain/habits";
import { PLACE_STATUS_LABELS, PLACE_TYPE_LABELS } from "@/domain/places";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import type { PlaceStatus, PlaceType } from "@/types/places";
import type { Trip } from "@/types/travel";

const TYPE_CHIPS = (Object.keys(PLACE_TYPE_LABELS) as PlaceType[]).map(
  (id) => ({ id, label: PLACE_TYPE_LABELS[id] })
);
const STATUS_CHIPS = (Object.keys(PLACE_STATUS_LABELS) as PlaceStatus[]).map(
  (id) => ({ id, label: PLACE_STATUS_LABELS[id] })
);

export default function PlaceFormScreen() {
  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const { fail } = useFeedback();
  const params = useLocalSearchParams<{ id?: string }>();
  const editId =
    typeof params.id === "string" && params.id.length > 0 ? params.id : null;

  const [loading, setLoading] = useState(Boolean(editId));
  const [name, setName] = useState("");
  const [type, setType] = useState<PlaceType>("restaurant");
  const [status, setStatus] = useState<PlaceStatus>("to_visit");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [tripId, setTripId] = useState<string | null>(null);
  const [rating, setRating] = useState("0");
  const [visitedDate, setVisitedDate] = useState(getTodayIso());
  const [trips, setTrips] = useState<Trip[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [googlePlaceId, setGooglePlaceId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [linkLedger, setLinkLedger] = useState(false);
  const [classId, setClassId] = useState<number | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: editId ? "Editar lugar" : "Novo lugar" });
  }, [editId, navigation]);

  useEffect(() => {
    let cancelled = false;
    void fetchTrips()
      .then((rows) => {
        if (!cancelled) setTrips(rows);
      })
      .catch(() => {
        /* viagem opcional */
      });
    if (!editId) {
      return () => {
        cancelled = true;
      };
    }
    void fetchPlaceById(editId)
      .then((place) => {
        if (cancelled) return;
        if (!place) {
          setError("Lugar não encontrado.");
          return;
        }
        setName(place.name);
        setType(place.type);
        setStatus(place.status ?? "to_visit");
        setAddress(place.address ?? "");
        setNotes(place.notes ?? "");
        setTripId(place.trip_id ?? null);
        setRating(place.rating != null ? String(place.rating) : "0");
        setVisitedDate(place.visited_date ?? getTodayIso());
        setLat(place.lat ?? null);
        setLng(place.lng ?? null);
        setGooglePlaceId(place.google_place_id ?? null);
        setAmount(place.amount != null ? String(place.amount) : "");
      })
      .catch((err) => {
        if (!cancelled) {
          setError(getErrorMessage(err, "Não foi possível abrir o lugar."));
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
      fail("Informe o nome do lugar.");
      return;
    }
    const parsedRating = Number.parseFloat(rating.replace(",", "."));
    setSaving(true);
    setError(null);
    const parsedAmount = Number.parseFloat(amount.replace(",", "."));
    const payload = {
      name: trimmed,
      type,
      status,
      address,
      notes,
      trip_id: tripId,
      rating:
        status === "visited" && Number.isFinite(parsedRating) && parsedRating > 0
          ? parsedRating
          : null,
      visited_date: status === "visited" ? visitedDate : null,
      lat,
      lng,
      google_place_id: googlePlaceId,
      amount:
        status === "visited" && Number.isFinite(parsedAmount) && parsedAmount > 0
          ? parsedAmount
          : null,
    };
    try {
      if (editId) await updatePlace({ id: editId, ...payload });
      else await createPlace({ ...payload, classId: linkLedger ? classId : null });
      router.back();
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível salvar o lugar."));
    } finally {
      setSaving(false);
    }
  }

  function onDelete() {
    if (!editId) return;
    Alert.alert("Excluir lugar", name || "Esse lugar", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: () => {
          void (async () => {
            setSaving(true);
            try {
              await deletePlace(editId);
              router.back();
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
          <Field label="Buscar no Google">
            <PlaceCatalogSearch
              onPick={(hit) => {
                setName(hit.name);
                setAddress(hit.address ?? "");
                setType(hit.type);
                setLat(hit.lat);
                setLng(hit.lng);
                setGooglePlaceId(hit.google_place_id);
              }}
            />
          </Field>
          <Field label="Nome" required>
            <TextInput
              autoFocus={!editId}
              placeholder="Padaria da esquina"
              placeholderTextColor={theme.textSecondary}
              style={inputStyle}
              value={name}
              onChangeText={setName}
            />
          </Field>
          <Field label="Tipo">
            <View style={styles.chips}>
              {TYPE_CHIPS.map((chip) => (
                <Pressable
                  key={chip.id}
                  onPress={() => setType(chip.id)}
                  style={[
                    styles.chip,
                    { backgroundColor: theme.backgroundElement },
                    type === chip.id && {
                      backgroundColor: theme.backgroundSelected,
                    },
                  ]}
                >
                  <ThemedText type="smallBold">{chip.label}</ThemedText>
                </Pressable>
              ))}
            </View>
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
          {status === "visited" ? (
            <>
              <Field label="Data da visita">
                <DateField
                  value={visitedDate}
                  onChange={setVisitedDate}
                  style={inputStyle}
                />
              </Field>
              <Field label="Nota (0–5)">
                <TextInput
                  keyboardType="decimal-pad"
                  style={inputStyle}
                  value={rating}
                  onChangeText={setRating}
                />
              </Field>
              <Field label="Gasto (opcional)">
                <TextInput
                  keyboardType="decimal-pad"
                  placeholder="0,00"
                  placeholderTextColor={theme.textSecondary}
                  style={inputStyle}
                  value={amount}
                  onChangeText={setAmount}
                />
              </Field>
              {!editId ? (
                <LedgerClassField
                  enabled={linkLedger}
                  onEnabledChange={setLinkLedger}
                  classId={classId}
                  onClassIdChange={setClassId}
                />
              ) : null}
            </>
          ) : null}
          <Field label="Endereço">
            <TextInput
              placeholder="Opcional"
              placeholderTextColor={theme.textSecondary}
              style={inputStyle}
              value={address}
              onChangeText={setAddress}
            />
          </Field>
          <Field label="Viagem">
            <View style={styles.chips}>
              <Pressable
                onPress={() => setTripId(null)}
                style={[
                  styles.chip,
                  { backgroundColor: theme.backgroundElement },
                  !tripId && { backgroundColor: theme.backgroundSelected },
                ]}
              >
                <ThemedText type="smallBold">Nenhuma</ThemedText>
              </Pressable>
              {trips.map((trip) => (
                <Pressable
                  key={trip.id}
                  onPress={() => setTripId(trip.id)}
                  style={[
                    styles.chip,
                    { backgroundColor: theme.backgroundElement },
                    tripId === trip.id && {
                      backgroundColor: theme.backgroundSelected,
                    },
                  ]}
                >
                  <ThemedText type="smallBold">{trip.title}</ThemedText>
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
                {editId ? "Salvar alterações" : "Criar lugar"}
              </ThemedText>
            )}
          </Pressable>
          {editId ? (
            <Pressable disabled={saving} onPress={onDelete}>
              <ThemedText themeColor="danger">Excluir lugar</ThemedText>
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
