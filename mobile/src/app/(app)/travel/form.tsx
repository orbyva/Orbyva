import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from "react-native";

import {
  createTrip,
  deleteTrip,
  fetchTripById,
  fetchTripItinerary,
  fetchTripStops,
  syncRoundTripTransfers,
  updateTrip,
  type TripStopDraft,
} from "@/api/travel/travel";
import { DateField } from "@/components/DateField";
import { PlaceCatalogSearch } from "@/components/PlaceCatalogSearch";
import { ChoiceChip } from "@/components/ChoiceChip";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner } from "@/components/ui/Banner";
import { FormButton } from "@/components/ui/FormButton";
import { FormBlock } from "@/components/ui/FormSection";
import { Spacing } from "@/constants/theme";
import { getTodayIso } from "@/domain/habits";
import { TRIP_STATUS_LABELS } from "@/domain/travel";
import {
  TRIP_TRANSPORT_MODE_LABELS,
  TRIP_TRANSPORT_MODES,
  type RoundTripHome,
  type TripTransportMode,
} from "@/domain/travel/transportModes";
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

function hhmm(value: string | null | undefined): string {
  return value?.trim().slice(0, 5) ?? "";
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
  const [includeRoundTrip, setIncludeRoundTrip] = useState(false);
  const [homeOrigin, setHomeOrigin] = useState<RoundTripHome | null>(null);
  const [roundTripMode, setRoundTripMode] = useState<TripTransportMode>("car");
  const [outboundDepart, setOutboundDepart] = useState("");
  const [outboundArrive, setOutboundArrive] = useState("");
  const [returnDepart, setReturnDepart] = useState("");
  const [returnArrive, setReturnArrive] = useState("");
  const [outboundId, setOutboundId] = useState<string | null>(null);
  const [returnId, setReturnId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: editId ? "Editar viagem" : "Nova viagem" });
  }, [editId, navigation]);

  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    void Promise.all([
      fetchTripById(editId),
      fetchTripStops(editId),
      fetchTripItinerary(editId).catch(() => []),
    ])
      .then(([trip, nextStops, itinerary]) => {
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
        if (trip.origin_label?.trim()) {
          setHomeOrigin({
            label: trip.origin_label.trim(),
            lat: trip.origin_lat ?? null,
            lng: trip.origin_lng ?? null,
            place_id: null,
          });
        }
        const days = [...itinerary].sort((a, b) => a.day_number - b.day_number);
        const firstActs = (days[0]?.activities ?? []).filter(
          (act) =>
            (act.category ?? "").toLowerCase() === "transport" ||
            act.title.includes("→")
        );
        const lastActs = (days[days.length - 1]?.activities ?? []).filter(
          (act) =>
            (act.category ?? "").toLowerCase() === "transport" ||
            act.title.includes("→")
        );
        const outbound = firstActs[0] ?? null;
        const returnTrip =
          lastActs.find((act) => act.id !== outbound?.id) ??
          (lastActs[0]?.id !== outbound?.id ? lastActs[0] : null);
        if (outbound || returnTrip || trip.origin_label) {
          setIncludeRoundTrip(true);
        }
        if (outbound) {
          setOutboundId(outbound.id);
          setOutboundDepart(hhmm(outbound.activity_time));
          setOutboundArrive(hhmm(outbound.arrival_time));
          if (outbound.transport_mode) {
            setRoundTripMode(outbound.transport_mode as TripTransportMode);
          }
          if (!trip.origin_label && outbound.origin_label) {
            setHomeOrigin({
              label: outbound.origin_label,
              lat: outbound.origin_lat ?? null,
              lng: outbound.origin_lng ?? null,
              place_id: outbound.origin_place_id ?? null,
            });
          }
        }
        if (returnTrip) {
          setReturnId(returnTrip.id);
          setReturnDepart(hhmm(returnTrip.activity_time));
          setReturnArrive(hhmm(returnTrip.arrival_time));
        }
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
    const namedStops = stops.filter((stop) => stop.name.trim());
    if (includeRoundTrip && !homeOrigin?.label.trim()) {
      fail("Informe a origem (casa / partida) dos deslocamentos.");
      return;
    }
    setSaving(true);
    setError(null);
    const origin = includeRoundTrip && homeOrigin?.label.trim()
      ? {
          origin_label: homeOrigin.label.trim(),
          origin_lat: homeOrigin.lat,
          origin_lng: homeOrigin.lng,
        }
      : {
          origin_label: null,
          origin_lat: null,
          origin_lng: null,
        };
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
      ...origin,
    };
    try {
      const tripId = editId
        ? editId
        : (await createTrip(payload)).id;
      if (editId) {
        await updateTrip({ id: editId, ...payload });
      }
      if (includeRoundTrip && homeOrigin?.label.trim()) {
        const firstStop = namedStops[0] ?? {
          name: destination.trim() || trimmed,
          start_date: startDate,
          end_date: endDate,
          lat: destLat,
          lng: destLng,
          place_id: destPlaceId,
        };
        const lastStop = namedStops[namedStops.length - 1] ?? firstStop;
        await syncRoundTripTransfers({
          tripId,
          home: {
            label: homeOrigin.label.trim(),
            lat: homeOrigin.lat,
            lng: homeOrigin.lng,
            place_id: homeOrigin.place_id,
          },
          firstStop,
          lastStop,
          mode: roundTripMode,
          outboundDepart,
          outboundArrive,
          returnDepart,
          returnArrive,
          outboundId,
          returnId,
        }).catch(() => undefined);
      }
      if (editId) {
        router.back();
      } else {
        router.replace({ pathname: "/travel/[id]", params: { id: tripId } });
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
          keyboardShouldPersistTaps="always"
        >
          <Banner message={error} />
          <FormBlock title="Essencial">
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
              selectedLabel={destPlaceId ? destination : null}
              onClear={() => {
                setDestination("");
                setDestLat(null);
                setDestLng(null);
                setDestPlaceId(null);
              }}
              onPick={(hit) => {
                setDestination(hit.name);
                setDestLat(hit.lat);
                setDestLng(hit.lng);
                setDestPlaceId(hit.google_place_id);
              }}
            />
            {!destPlaceId ? (
              <TextInput
                placeholder="Ou digite o nome manualmente"
                placeholderTextColor={theme.textSecondary}
                style={inputStyle}
                value={destination}
                onChangeText={setDestination}
              />
            ) : null}
          </Field>
          <Field label="Início">
            <DateField value={startDate} onChange={setStartDate} style={inputStyle} />
          </Field>
          <Field label="Fim">
            <DateField value={endDate} onChange={setEndDate} style={inputStyle} />
          </Field>
          </FormBlock>
          <FormBlock title="Destinos">
          <Field label="Paradas">
            {stops.map((stop, index) => (
              <View key={`${stop.name}-${index}`} style={styles.stop}>
                <PlaceCatalogSearch
                  placeholder="Buscar parada"
                  scope="regions"
                  requestUserLocation={false}
                  selectedLabel={stop.place_id ? stop.name : null}
                  onClear={() =>
                    setStops((cur) =>
                      cur.map((row, i) =>
                        i === index
                          ? {
                              ...row,
                              name: "",
                              place_id: null,
                              lat: null,
                              lng: null,
                            }
                          : row
                      )
                    )
                  }
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
                {!stop.place_id ? (
                  <TextInput
                    placeholder="Ou digite o nome manualmente"
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
                ) : null}
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
                <FormButton
                  label="Remover parada"
                  tone="danger"
                  onPress={() =>
                    setStops((cur) => cur.filter((_, i) => i !== index))
                  }
                />
              </View>
            ))}
            <FormButton
              label="Adicionar parada"
              onPress={() =>
                setStops((cur) => [
                  ...cur,
                  { name: "", start_date: startDate, end_date: endDate },
                ])
              }
            />
          </Field>
          </FormBlock>

          <View
            style={[
              styles.round,
              {
                backgroundColor: theme.surface,
                borderColor: theme.backgroundSelected,
              },
            ]}
          >
            <View style={styles.roundHead}>
              <View style={styles.copy}>
                <ThemedText type="smallBold">
                  {editId
                    ? "Deslocamentos de ida e volta"
                    : "Incluir deslocamentos de ida e volta"}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Gera trechos de transporte no roteiro entre origem e paradas.
                </ThemedText>
              </View>
              <Switch
                value={includeRoundTrip}
                onValueChange={setIncludeRoundTrip}
                trackColor={{ false: theme.backgroundSelected, true: theme.primary }}
                thumbColor="#FFFFFF"
              />
            </View>
            {includeRoundTrip ? (
              <View style={styles.roundBody}>
                <Field label="Origem (casa / partida)">
                  <PlaceCatalogSearch
                    placeholder="Buscar origem"
                    scope="regions"
                    requestUserLocation={false}
                    selectedLabel={homeOrigin?.place_id ? homeOrigin.label : null}
                    onClear={() => setHomeOrigin(null)}
                    onPick={(hit) =>
                      setHomeOrigin({
                        label: hit.name,
                        lat: hit.lat,
                        lng: hit.lng,
                        place_id: hit.google_place_id,
                      })
                    }
                  />
                  {!homeOrigin?.place_id ? (
                    <TextInput
                      placeholder="Ou digite o nome manualmente"
                      placeholderTextColor={theme.textSecondary}
                      style={inputStyle}
                      value={homeOrigin?.label ?? ""}
                      onChangeText={(value) =>
                        setHomeOrigin((cur) => ({
                          label: value,
                          lat: cur?.lat ?? null,
                          lng: cur?.lng ?? null,
                          place_id: cur?.place_id ?? null,
                        }))
                      }
                    />
                  ) : null}
                </Field>
                <Field label="Modo">
                  <View style={styles.chips}>
                    {TRIP_TRANSPORT_MODES.map((mode) => (
                      <ChoiceChip
                        key={mode}
                        label={TRIP_TRANSPORT_MODE_LABELS[mode]}
                        active={roundTripMode === mode}
                        onPress={() => setRoundTripMode(mode)}
                      />
                    ))}
                  </View>
                </Field>
                <Field label="Ida · saída">
                  <TextInput
                    placeholder="HH:mm"
                    placeholderTextColor={theme.textSecondary}
                    style={inputStyle}
                    value={outboundDepart}
                    onChangeText={setOutboundDepart}
                  />
                </Field>
                <Field label="Ida · chegada">
                  <TextInput
                    placeholder="HH:mm"
                    placeholderTextColor={theme.textSecondary}
                    style={inputStyle}
                    value={outboundArrive}
                    onChangeText={setOutboundArrive}
                  />
                </Field>
                <Field label="Volta · saída">
                  <TextInput
                    placeholder="HH:mm"
                    placeholderTextColor={theme.textSecondary}
                    style={inputStyle}
                    value={returnDepart}
                    onChangeText={setReturnDepart}
                  />
                </Field>
                <Field label="Volta · chegada">
                  <TextInput
                    placeholder="HH:mm"
                    placeholderTextColor={theme.textSecondary}
                    style={inputStyle}
                    value={returnArrive}
                    onChangeText={setReturnArrive}
                  />
                </Field>
              </View>
            ) : null}
          </View>

          <FormBlock title="Detalhes">
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
                  <ChoiceChip
                    key={chip.id}
                    label={chip.label}
                    active={status === chip.id}
                    onPress={() => setStatus(chip.id)}
                  />
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
          </FormBlock>
          <FormButton
            label={editId ? "Salvar alterações" : "Criar viagem"}
            tone="primary"
            disabled={saving}
            busy={saving}
            onPress={() => void onSave()}
          />
          {editId ? (
            <FormButton
              label="Excluir viagem"
              tone="danger"
              disabled={saving}
              onPress={onDelete}
            />
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
  round: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  roundHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  copy: { flex: 1, gap: 2 },
  roundBody: { paddingHorizontal: 14, paddingBottom: 14, gap: Spacing.three },
  primary: {
    height: 48,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.two,
  },
  primaryLabel: { color: "#0B0F1A" },
});
