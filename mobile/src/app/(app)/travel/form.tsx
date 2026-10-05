import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
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
import { Banner, Button, Field, FormBlock, Input } from "@/components/ui";
import { Radius, Spacing } from "@/constants/theme";
import { getTodayIso } from "@/domain/habits";
import { TRIP_STATUS_LABELS } from "@/domain/travel";
import {
  destinationFieldsFromStops,
  validateTripStops,
} from "@/domain/travel/tripStops";
import {
  endpointFromStop,
  lodgingStopForDate,
  planItineraryTransfers,
} from "@/domain/travel/itineraryTransfers";
import {
  TRIP_TRANSPORT_MODE_LABELS,
  TRIP_TRANSPORT_MODES,
  canEstimateTransferArrival,
  transferEndpointHasCoords,
  transportModeHint,
  type RoundTripHome,
  type TripTransportMode,
} from "@/domain/travel/transportModes";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-toast";
import { estimateTransferTimes } from "@/lib/estimateTripLeg";
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
  const [outboundEstimateNote, setOutboundEstimateNote] = useState<string | null>(
    null
  );
  const [returnEstimateNote, setReturnEstimateNote] = useState<string | null>(
    null
  );
  const [estimatingLeg, setEstimatingLeg] = useState<"outbound" | "return" | null>(
    null
  );
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
        setStartDate(trip.start_date);
        setEndDate(trip.end_date);
        setStatus(trip.status);
        setNotes(trip.notes ?? "");
        setBudget(trip.budget != null ? String(trip.budget) : "");
        setStops(
          nextStops.length > 0
            ? nextStops.map((stop) => ({
                name: stop.name,
                start_date: stop.start_date,
                end_date: stop.end_date,
                place_id: stop.place_id ?? null,
                lat: stop.lat ?? null,
                lng: stop.lng ?? null,
              }))
            : trip.destination?.trim()
              ? [
                  {
                    name: trip.destination.trim(),
                    start_date: trip.start_date,
                    end_date: trip.end_date,
                    place_id: trip.destination_place_id ?? null,
                    lat: trip.destination_lat ?? null,
                    lng: trip.destination_lng ?? null,
                  },
                ]
              : []
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
    const stopError = validateTripStops(namedStops, startDate, endDate);
    if (stopError) {
      fail(stopError);
      return;
    }
    if (includeRoundTrip && !homeOrigin?.label.trim()) {
      fail("Informe a origem (casa / partida) dos deslocamentos.");
      return;
    }
    setSaving(true);
    setError(null);
    const origin =
      includeRoundTrip && homeOrigin?.label.trim()
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
    const dest = destinationFieldsFromStops(
      namedStops.map((stop, i) => ({ ...stop, sort_order: i }))
    );
    const payload = {
      title: trimmed,
      destination: dest.destination,
      destination_lat: dest.destination_lat,
      destination_lng: dest.destination_lng,
      destination_place_id: dest.destination_place_id,
      start_date: startDate,
      end_date: endDate,
      status,
      notes,
      budget: budget.trim() ? Number(budget.replace(",", ".")) || null : null,
      stops: namedStops,
      ...origin,
    };
    try {
      const tripId = editId ? editId : (await createTrip(payload)).id;
      if (editId) {
        await updateTrip({ id: editId, ...payload });
      }
      if (includeRoundTrip && homeOrigin?.label.trim()) {
        await syncRoundTripTransfers({
          tripId,
          home: {
            label: homeOrigin.label.trim(),
            lat: homeOrigin.lat,
            lng: homeOrigin.lng,
            place_id: homeOrigin.place_id,
          },
          stops: namedStops,
          startDate,
          endDate,
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

  async function handleEstimateLeg(leg: "outbound" | "return") {
    if (estimatingLeg) return;
    const namedStops = stops.filter((stop) => stop.name.trim());
    const firstStop = namedStops[0];
    const homeEndpoint = homeOrigin?.label.trim()
      ? {
          label: homeOrigin.label.trim(),
          lat: homeOrigin.lat,
          lng: homeOrigin.lng,
          place_id: homeOrigin.place_id,
        }
      : null;
    const planned = planItineraryTransfers({
      stops: namedStops.map((stop, i) => ({ ...stop, sort_order: i })),
      startDate,
      endDate,
      home: homeEndpoint,
    });
    const outboundPlanned = planned.find((t) => t.role === "outbound");
    const returnPlanned = [...planned]
      .reverse()
      .find((t) => t.role === "return");
    const lastLodging = lodgingStopForDate(namedStops, endDate);
    const firstEndpoint = outboundPlanned?.destination
      ? outboundPlanned.destination
      : firstStop
        ? {
            label: firstStop.name.trim(),
            lat: firstStop.lat ?? null,
            lng: firstStop.lng ?? null,
            place_id: firstStop.place_id ?? null,
          }
        : null;
    const lastEndpoint = returnPlanned?.origin
      ? returnPlanned.origin
      : lastLodging
        ? endpointFromStop(lastLodging)
        : null;
    const isOutbound = leg === "outbound";
    setEstimatingLeg(leg);
    try {
      const result = await estimateTransferTimes({
        mode: roundTripMode,
        origin: isOutbound ? homeEndpoint : lastEndpoint,
        destination: isOutbound ? firstEndpoint : homeEndpoint,
        depart: isOutbound ? outboundDepart : returnDepart,
        arrive: isOutbound ? outboundArrive : returnArrive,
      });
      if (isOutbound) {
        setOutboundDepart(result.depart);
        setOutboundArrive(result.arrive);
        setOutboundEstimateNote(result.note);
      } else {
        setReturnDepart(result.depart);
        setReturnArrive(result.arrive);
        setReturnEstimateNote(result.note);
      }
    } catch (err) {
      const note = getErrorMessage(err, "Não foi possível estimar o horário.");
      if (isOutbound) setOutboundEstimateNote(note);
      else setReturnEstimateNote(note);
    } finally {
      setEstimatingLeg(null);
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
        keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="always"
        >
          <Banner message={error} />
          <FormBlock title="Essencial">
          <Field label="Título" required>
            <Input
              autoFocus={!editId}
              placeholder="Férias em Lisboa"
              value={title}
              onChangeText={setTitle}
            />
          </Field>
          <Field label="Início">
            <DateField value={startDate} onChange={setStartDate} />
          </Field>
          <Field label="Fim">
            <DateField value={endDate} onChange={setEndDate} />
          </Field>
          </FormBlock>
          <FormBlock title="Paradas">
          <ThemedText type="small" themeColor="mutedForeground">
            Cidades, estados ou países do roteiro — o destino da viagem sai
            daqui.
          </ThemedText>
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
                  <Input
                    placeholder="Ou digite o nome manualmente"
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
                />
                <Button
                  label="Remover parada"
                  onPress={() =>
                    setStops((cur) => cur.filter((_, i) => i !== index))
                  }
                  variant="destructive"
                />
              </View>
            ))}
            <Button
              label="Adicionar parada"
              onPress={() =>
                setStops((cur) => [
                  ...cur,
                  { name: "", start_date: startDate, end_date: endDate },
                ])
              }
              variant="outline"
            />
          </Field>
          </FormBlock>

          <View
            style={[
              styles.round,
              {
                backgroundColor: theme.card,
                borderColor: theme.border,
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
                <ThemedText type="small" themeColor="mutedForeground">
                  Gera trechos de transporte no roteiro entre origem e paradas.
                </ThemedText>
              </View>
              <Switch
                value={includeRoundTrip}
                onValueChange={setIncludeRoundTrip}
                trackColor={{ false: theme.input, true: theme.primary }}
                ios_backgroundColor={theme.input}
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
                    <Input
                      placeholder="Ou digite o nome manualmente"
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
                  <Input
                    placeholder="HH:mm"
                    value={outboundDepart}
                    onChangeText={(value) => {
                      setOutboundDepart(value);
                      setOutboundEstimateNote(null);
                    }}
                  />
                </Field>
                <Field label="Ida · chegada">
                  <Input
                    placeholder="HH:mm"
                    value={outboundArrive}
                    onChangeText={(value) => {
                      setOutboundArrive(value);
                      setOutboundEstimateNote(null);
                    }}
                  />
                </Field>
                {canEstimateTransferArrival(roundTripMode) ? (
                  <View style={styles.field}>
                    <Button
                      label={
                        estimatingLeg === "outbound"
                          ? "Estimando ida…"
                          : "Estimar ida pela rota"
                      }
                      disabled={
                        estimatingLeg != null ||
                        (!outboundDepart.trim() && !outboundArrive.trim())
                      }
                      loading={estimatingLeg === "outbound"}
                      onPress={() => void handleEstimateLeg("outbound")}
                      variant="outline"
                      size="sm"
                    />
                    {!transferEndpointHasCoords(homeOrigin) ||
                    !stops.some(
                      (stop) =>
                        stop.name.trim() &&
                        transferEndpointHasCoords({
                          lat: stop.lat ?? null,
                          lng: stop.lng ?? null,
                        })
                    ) ? (
                      <ThemedText type="small" themeColor="mutedForeground">
                        Origem e 1ª parada precisam de coordenadas.
                      </ThemedText>
                    ) : null}
                    {outboundEstimateNote ? (
                      <ThemedText type="small" themeColor="mutedForeground">
                        {outboundEstimateNote}
                      </ThemedText>
                    ) : (
                      <ThemedText type="small" themeColor="mutedForeground">
                        {transportModeHint(roundTripMode)}
                      </ThemedText>
                    )}
                  </View>
                ) : (
                  <ThemedText type="small" themeColor="mutedForeground">
                    {transportModeHint(roundTripMode)}
                  </ThemedText>
                )}
                <Field label="Volta · saída">
                  <Input
                    placeholder="HH:mm"
                    value={returnDepart}
                    onChangeText={(value) => {
                      setReturnDepart(value);
                      setReturnEstimateNote(null);
                    }}
                  />
                </Field>
                <Field label="Volta · chegada">
                  <Input
                    placeholder="HH:mm"
                    value={returnArrive}
                    onChangeText={(value) => {
                      setReturnArrive(value);
                      setReturnEstimateNote(null);
                    }}
                  />
                </Field>
                {canEstimateTransferArrival(roundTripMode) ? (
                  <View style={styles.field}>
                    <Button
                      label={
                        estimatingLeg === "return"
                          ? "Estimando volta…"
                          : "Estimar volta pela rota"
                      }
                      disabled={
                        estimatingLeg != null ||
                        (!returnDepart.trim() && !returnArrive.trim())
                      }
                      loading={estimatingLeg === "return"}
                      onPress={() => void handleEstimateLeg("return")}
                      variant="outline"
                      size="sm"
                    />
                    {returnEstimateNote ? (
                      <ThemedText type="small" themeColor="mutedForeground">
                        {returnEstimateNote}
                      </ThemedText>
                    ) : null}
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>

          <FormBlock title="Detalhes">
            <Field label="Orçamento">
              <Input
                keyboardType="decimal-pad"
                placeholder="Opcional"
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
              <Input
                placeholder="Opcional"
                value={notes}
                onChangeText={setNotes}
              />
            </Field>
          </FormBlock>
          <Button
            label={editId ? "Salvar alterações" : "Criar viagem"}
            disabled={saving}
            loading={saving}
            onPress={() => void onSave()}
            size="lg"
          />
          {editId ? (
            <Button
              label="Excluir viagem"
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
  field: { gap: 8 },
  stop: { gap: 8, marginBottom: Spacing.two },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  round: {
    borderRadius: Radius.xl,
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
});
