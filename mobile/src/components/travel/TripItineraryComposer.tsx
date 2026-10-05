import { useState } from "react";
import {
  StyleSheet,
  View,
} from "react-native";

import { createPlace } from "@/api/places/places";
import { createItineraryActivity } from "@/api/travel/travel";
import { ChoiceChip } from "@/components/ChoiceChip";
import {
  PlaceCatalogSearch,
  type PlaceCatalogPick,
} from "@/components/PlaceCatalogSearch";
import { ThemedText } from "@/components/themed-text";
import { Button, Input } from "@/components/ui";
import { Spacing } from "@/constants/theme";
import { PLACE_TYPE_LABELS } from "@/domain/places";
import {
  TRIP_TRANSPORT_MODE_LABELS,
  TRIP_TRANSPORT_MODES,
  canEstimateTransferArrival,
  hasRequiredTransferEndpoints,
  transferEndpointsTitle,
  transportModeHint,
  type TransferEndpoint,
  type TripTransportMode,
} from "@/domain/travel/transportModes";
import { estimateTransferTimes } from "@/lib/estimateTripLeg";
import { getErrorMessage } from "@/lib/errors";
import type { PlaceType, PlaceVisit } from "@/types/places";

function pickToEndpoint(hit: PlaceCatalogPick): TransferEndpoint {
  return {
    label: hit.name.trim(),
    lat: hit.lat,
    lng: hit.lng,
    place_id: hit.google_place_id?.trim() || null,
  };
}

export function TripItineraryComposer({
  tripId,
  dayId,
  kind,
  tripPlaces,
  onCreated,
  onPlaceCreated,
  onCancel,
  fail,
  sortOrder,
}: {
  tripId: string;
  dayId: string;
  kind: "visit" | "transfer";
  tripPlaces: PlaceVisit[];
  onCreated: () => Promise<void>;
  onPlaceCreated: (place: PlaceVisit) => void;
  onCancel: () => void;
  fail: (message: string) => void;
  sortOrder?: number;
}) {
  const [busy, setBusy] = useState(false);
  const [visitPick, setVisitPick] = useState<PlaceCatalogPick | null>(null);
  const [visitPlaceId, setVisitPlaceId] = useState<string | null>(null);
  const [visitTime, setVisitTime] = useState("");
  const [visitNotes, setVisitNotes] = useState("");
  const [origin, setOrigin] = useState<TransferEndpoint | null>(null);
  const [destination, setDestination] = useState<TransferEndpoint | null>(null);
  const [mode, setMode] = useState<TripTransportMode>("car");
  const [depart, setDepart] = useState("");
  const [arrive, setArrive] = useState("");
  const [estimateNote, setEstimateNote] = useState<string | null>(null);
  const [estimating, setEstimating] = useState(false);


  const selectedPlace = tripPlaces.find((place) => place.id === visitPlaceId);

  async function addVisit() {
    let placeVisitId = visitPlaceId;
    let title = selectedPlace?.name ?? visitPick?.name ?? "";
    let category: PlaceType = selectedPlace?.type ?? visitPick?.type ?? "attraction";
    if (!placeVisitId && visitPick) {
      const created = await createPlace({
        trip_id: tripId,
        name: visitPick.name,
        type: visitPick.type,
        status: "to_visit",
        address: visitPick.address,
        lat: visitPick.lat,
        lng: visitPick.lng,
        google_place_id: visitPick.google_place_id,
        would_recommend: true,
      });
      onPlaceCreated(created);
      placeVisitId = created.id;
      title = created.name;
      category = created.type;
    }
    if (!title.trim()) {
      fail("Busque um lugar ou escolha um já desta viagem.");
      return false;
    }
    await createItineraryActivity({
      day_id: dayId,
      title: title.trim(),
      activity_time: visitTime.trim() || null,
      notes: visitNotes.trim() || null,
      category,
      place_visit_id: placeVisitId,
      sort_order: sortOrder,
    });
    return true;
  }

  async function addTransfer() {
    if (!hasRequiredTransferEndpoints(origin?.label, destination?.label)) {
      fail("Origem e destino obrigatórios no deslocamento.");
      return false;
    }
    await createItineraryActivity({
      day_id: dayId,
      title: transferEndpointsTitle(origin!.label, destination!.label),
      category: "transport",
      transport_mode: mode,
      activity_time: depart.trim() || null,
      arrival_time: arrive.trim() || null,
      origin_label: origin!.label.trim(),
      origin_lat: origin!.lat,
      origin_lng: origin!.lng,
      origin_place_id: origin!.place_id,
      destination_label: destination!.label.trim(),
      destination_lat: destination!.lat,
      destination_lng: destination!.lng,
      destination_place_id: destination!.place_id,
      sort_order: sortOrder,
    });
    return true;
  }

  async function onSubmit() {
    if (busy) return;
    setBusy(true);
    try {
      const ok = kind === "visit" ? await addVisit() : await addTransfer();
      if (!ok) return;
      await onCreated();
      onCancel();
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível adicionar ao roteiro."));
    } finally {
      setBusy(false);
    }
  }

  async function onEstimate() {
    if (estimating) return;
    setEstimating(true);
    try {
      const result = await estimateTransferTimes({
        mode,
        origin,
        destination,
        depart,
        arrive,
      });
      setDepart(result.depart);
      setArrive(result.arrive);
      setEstimateNote(result.note);
    } catch (err) {
      setEstimateNote(
        getErrorMessage(err, "Não foi possível estimar o horário.")
      );
    } finally {
      setEstimating(false);
    }
  }

  return (
    <View style={styles.body}>
      <ThemedText type="smallBold">
        {kind === "visit" ? "Nova visita" : "Novo deslocamento"}
      </ThemedText>
      {kind === "visit" ? (
        <>
          <PlaceCatalogSearch
            placeholder="Buscar lugar no Maps"
            selectedLabel={visitPick?.name ?? null}
            onClear={() => setVisitPick(null)}
            onPick={(hit) => {
              setVisitPick(hit);
              setVisitPlaceId(null);
            }}
          />
          {tripPlaces.length > 0 ? (
            <View style={styles.field}>
              <ThemedText type="small" themeColor="mutedForeground">
                Ou um lugar já desta viagem
              </ThemedText>
              <View style={styles.chips}>
                {tripPlaces.slice(0, 12).map((place) => (
                  <ChoiceChip
                    key={place.id}
                    label={`${PLACE_TYPE_LABELS[place.type] ?? ""} ${place.name}`.trim()}
                    active={visitPlaceId === place.id}
                    onPress={() => {
                      setVisitPlaceId(place.id);
                      setVisitPick(null);
                    }}
                  />
                ))}
              </View>
            </View>
          ) : null}
          <Input
            placeholder="Horário (ex. 09:30) — opcional"
            value={visitTime}
            onChangeText={setVisitTime}
          />
          <Input
            placeholder="Observação — opcional"
            value={visitNotes}
            onChangeText={setVisitNotes}
          />
        </>
      ) : (
        <>
          <ThemedText type="small" themeColor="mutedForeground">
            Origem
          </ThemedText>
          <PlaceCatalogSearch
            placeholder="Buscar origem"
            scope="regions"
            requestUserLocation={false}
            selectedLabel={origin?.place_id ? origin.label : null}
            onClear={() => setOrigin(null)}
            onPick={(hit) => setOrigin(pickToEndpoint(hit))}
          />
          {!origin?.place_id ? (
            <Input
              placeholder="Ou digite a origem"
              value={origin?.label ?? ""}
              onChangeText={(value) =>
                setOrigin((cur) => ({
                  label: value,
                  lat: cur?.lat ?? null,
                  lng: cur?.lng ?? null,
                  place_id: cur?.place_id ?? null,
                }))
              }
            />
          ) : null}
          <ThemedText type="small" themeColor="mutedForeground">
            Destino
          </ThemedText>
          <PlaceCatalogSearch
            placeholder="Buscar destino"
            scope="regions"
            requestUserLocation={false}
            selectedLabel={destination?.place_id ? destination.label : null}
            onClear={() => setDestination(null)}
            onPick={(hit) => setDestination(pickToEndpoint(hit))}
          />
          {!destination?.place_id ? (
            <Input
              placeholder="Ou digite o destino"
              value={destination?.label ?? ""}
              onChangeText={(value) =>
                setDestination((cur) => ({
                  label: value,
                  lat: cur?.lat ?? null,
                  lng: cur?.lng ?? null,
                  place_id: cur?.place_id ?? null,
                }))
              }
            />
          ) : null}
          <View style={styles.chips}>
            {TRIP_TRANSPORT_MODES.map((item) => (
              <ChoiceChip
                key={item}
                label={TRIP_TRANSPORT_MODE_LABELS[item]}
                active={mode === item}
                onPress={() => setMode(item)}
              />
            ))}
          </View>
          <Input
            placeholder="Saída HH:mm — opcional"
            value={depart}
            onChangeText={(value) => {
              setDepart(value);
              setEstimateNote(null);
            }}
          />
          <Input
            placeholder="Chegada HH:mm — opcional"
            value={arrive}
            onChangeText={(value) => {
              setArrive(value);
              setEstimateNote(null);
            }}
          />
          {canEstimateTransferArrival(mode) ? (
            <>
              <Button
                label={estimating ? "Estimando…" : "Estimar pela rota"}
                loading={estimating}
                disabled={estimating || (!depart.trim() && !arrive.trim())}
                onPress={() => void onEstimate()}
                variant="outline"
                size="sm"
              />
              <ThemedText type="small" themeColor="mutedForeground">
                {estimateNote ?? transportModeHint(mode)}
              </ThemedText>
            </>
          ) : (
            <ThemedText type="small" themeColor="mutedForeground">
              {transportModeHint(mode)}
            </ThemedText>
          )}
        </>
      )}
      <Button
        label={kind === "visit" ? "Adicionar visita" : "Adicionar deslocamento"}
        loading={busy}
        disabled={busy}
        onPress={() => void onSubmit()}
        size="lg"
      />
      <Button
        label="Cancelar"
        onPress={onCancel}
        variant="outline"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: Spacing.two },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  field: { gap: 8 },
});
