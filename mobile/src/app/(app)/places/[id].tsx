import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import {
  createPlaceVisitOccurrence,
  deletePlaceVisitOccurrence,
  fetchPlaceById,
  fetchPlaceVisitOccurrences,
} from "@/api/places/places";
import { DateField } from "@/components/DateField";
import { LedgerClassField } from "@/components/LedgerClassField";
import { OpinionShareSheet } from "@/components/share/OpinionShareSheet";
import { StoryShareCard } from "@/components/share/StoryShareCard";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner } from "@/components/ui/Banner";
import { Card } from "@/components/ui/Card";
import { FormButton } from "@/components/ui/FormButton";
import { Spacing } from "@/constants/theme";
import {
  formatRating,
  getRatingLabel,
  mapsSearchUrl,
  PLACE_STATUS_LABELS,
  PLACE_TYPE_EMOJI,
  PLACE_TYPE_LABELS,
} from "@/domain/places";
import { buildPlaceShareText } from "@/domain/share";
import { useAppShell } from "@/hooks/use-app-shell";
import { useTheme } from "@/hooks/use-theme";
import { formatBRL, formatDateBR } from "@/lib/currency";
import { getErrorMessage } from "@/lib/errors";
import { getTodayIso } from "@/domain/habits";
import type { PlaceVisit, PlaceVisitOccurrence } from "@/types/places";

export default function PlaceDetailScreen() {
  const theme = useTheme();
  const navigation = useNavigation();
  const router = useRouter();
  const { bottomInset } = useAppShell();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const [place, setPlace] = useState<PlaceVisit | null>(null);
  const [visits, setVisits] = useState<PlaceVisitOccurrence[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [visitDate, setVisitDate] = useState(getTodayIso());
  const [visitAmount, setVisitAmount] = useState("");
  const [visitRating, setVisitRating] = useState("");
  const [visitNotes, setVisitNotes] = useState("");
  const [addingVisit, setAddingVisit] = useState(false);
  const [linkLedger, setLinkLedger] = useState(false);
  const [classId, setClassId] = useState<number | null>(null);
  const [savingVisit, setSavingVisit] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const load = useCallback(async () => {
    const row = await fetchPlaceById(id);
    setPlace(row);
    navigation.setOptions({ title: row?.name ?? "Lugar" });
    if (!row) setError("Lugar não encontrado.");
    else {
      setVisits(await fetchPlaceVisitOccurrences(row.id).catch(() => []));
    }
  }, [id, navigation]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      void load()
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
    }, [load])
  );

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator color={theme.primary} />
      </ThemedView>
    );
  }

  const maps = place ? mapsSearchUrl(place) : null;

  return (
    <ThemedView style={styles.flex}>
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: bottomInset + 24 }]}
      >
        <Banner message={error} />
        {place ? (
          <Card style={styles.card}>
            <ThemedText type="title">{place.name}</ThemedText>
            <ThemedText themeColor="textSecondary">
              {[
                PLACE_TYPE_LABELS[place.type] ?? place.type,
                place.status ? PLACE_STATUS_LABELS[place.status] : null,
                place.rating ? `${place.rating.toFixed(1)}★` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </ThemedText>
            {place.visited_date ? (
              <ThemedText type="small" themeColor="textSecondary">
                Visitado em {formatDateBR(place.visited_date)}
              </ThemedText>
            ) : null}
            {place.address ? (
              <ThemedText>{place.address}</ThemedText>
            ) : null}
            {place.trip?.title ? (
              <ThemedText type="small" themeColor="textSecondary">
                Viagem: {place.trip.title}
              </ThemedText>
            ) : null}
            {place.amount ? (
              <ThemedText type="small" themeColor="textSecondary">
                Gasto {formatBRL(place.amount)}
                {place.transaction_id ? " · no extrato" : ""}
              </ThemedText>
            ) : null}
            {place.notes ? <ThemedText>{place.notes}</ThemedText> : null}
            {maps ? (
              <FormButton
                label="Abrir no mapa"
                onPress={() => void Linking.openURL(maps)}
              />
            ) : null}
            <FormButton
              label="Compartilhar"
              onPress={() => setShareOpen(true)}
            />
            <FormButton
              label="Editar"
              tone="primary"
              onPress={() =>
                router.push({
                  pathname: "/places/form",
                  params: { id: place.id },
                })
              }
            />
          </Card>
        ) : null}
        {place ? (
          <Card style={styles.card}>
            <View style={styles.visitHead}>
              <ThemedText type="smallBold">
                {visits.length === 0
                  ? "Nenhuma visita ainda"
                  : `${visits.length} visita${visits.length === 1 ? "" : "s"}`}
              </ThemedText>
              <FormButton
                label={addingVisit ? "Cancelar" : "Nova visita"}
                compact
                onPress={() => setAddingVisit((cur) => !cur)}
              />
            </View>
            {visits.map((visit) => (
              <View key={visit.id} style={styles.visitRow}>
                <View style={styles.visitCopy}>
                  <ThemedText type="smallBold">
                    {formatDateBR(visit.visited_date)}
                    {visit.rating != null ? ` · ${visit.rating}★` : ""}
                  </ThemedText>
                  {visit.notes ? (
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                      {visit.notes}
                    </ThemedText>
                  ) : null}
                  {visit.amount ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      {formatBRL(visit.amount)}
                      {visit.transaction_id ? " · extrato" : ""}
                    </ThemedText>
                  ) : null}
                </View>
                <FormButton
                  label="Excluir"
                  tone="danger"
                  compact
                  onPress={() => {
                    Alert.alert("Excluir visita", "Essa ação não tem volta.", [
                      { text: "Cancelar", style: "cancel" },
                      {
                        text: "Excluir",
                        style: "destructive",
                        onPress: () => {
                          void deletePlaceVisitOccurrence(visit.id)
                            .then(() => load())
                            .catch((err) =>
                              Alert.alert(
                                "Não foi possível excluir",
                                getErrorMessage(err, "Tente de novo.")
                              )
                            );
                        },
                      },
                    ]);
                  }}
                />
              </View>
            ))}
            {addingVisit ? (
              <>
                <DateField
                  value={visitDate}
                  onChange={setVisitDate}
                  style={[
                    styles.input,
                    {
                      borderColor: theme.backgroundSelected,
                      backgroundColor: theme.backgroundElement,
                    },
                  ]}
                />
                <TextInput
                  keyboardType="decimal-pad"
                  placeholder="Nota 0–5 (opcional)"
                  placeholderTextColor={theme.textSecondary}
                  value={visitRating}
                  onChangeText={setVisitRating}
                  style={[
                    styles.input,
                    {
                      color: theme.text,
                      borderColor: theme.backgroundSelected,
                      backgroundColor: theme.backgroundElement,
                    },
                  ]}
                />
                <TextInput
                  keyboardType="decimal-pad"
                  placeholder="Gasto (opcional)"
                  placeholderTextColor={theme.textSecondary}
                  value={visitAmount}
                  onChangeText={setVisitAmount}
                  style={[
                    styles.input,
                    {
                      color: theme.text,
                      borderColor: theme.backgroundSelected,
                      backgroundColor: theme.backgroundElement,
                    },
                  ]}
                />
                <TextInput
                  placeholder="Comentário (pratos, ambiente...)"
                  placeholderTextColor={theme.textSecondary}
                  value={visitNotes}
                  onChangeText={setVisitNotes}
                  style={[
                    styles.input,
                    {
                      color: theme.text,
                      borderColor: theme.backgroundSelected,
                      backgroundColor: theme.backgroundElement,
                    },
                  ]}
                />
                <LedgerClassField
                  enabled={linkLedger}
                  onEnabledChange={setLinkLedger}
                  classId={classId}
                  onClassIdChange={setClassId}
                />
                <FormButton
                  label={savingVisit ? "Salvando…" : "Salvar visita"}
                  tone="primary"
                  disabled={savingVisit}
                  busy={savingVisit}
                  onPress={() => {
                    void (async () => {
                      setSavingVisit(true);
                      try {
                        const parsed = Number.parseFloat(
                          visitAmount.replace(",", ".")
                        );
                        const parsedRating = Number.parseFloat(
                          visitRating.replace(",", ".")
                        );
                        await createPlaceVisitOccurrence({
                          place_visit_id: place.id,
                          visited_date: visitDate,
                          rating:
                            Number.isFinite(parsedRating) && parsedRating > 0
                              ? parsedRating
                              : null,
                          notes: visitNotes.trim() || null,
                          amount:
                            Number.isFinite(parsed) && parsed > 0 ? parsed : null,
                          classId: linkLedger ? classId : null,
                        });
                        setVisitAmount("");
                        setVisitRating("");
                        setVisitNotes("");
                        setAddingVisit(false);
                        await load();
                      } catch (err) {
                        Alert.alert(
                          "Não foi possível registrar",
                          getErrorMessage(err, "Tente de novo.")
                        );
                      } finally {
                        setSavingVisit(false);
                      }
                    })();
                  }}
                />
              </>
            ) : null}
          </Card>
        ) : null}
      </ScrollView>
      {place ? (
        <OpinionShareSheet
          visible={shareOpen}
          onClose={() => setShareOpen(false)}
          title={place.name}
          hasNotes={Boolean(place.notes?.trim())}
          allowPhoto
          message={(includeNotes) =>
            buildPlaceShareText(place, { includeNotes })
          }
          renderCard={({ includeNotes, photoUri, photoUris }) => (
            <StoryShareCard
              coverUri={photoUri}
              coverUris={photoUris}
              coverVariant="photo"
              fallbackEmoji={PLACE_TYPE_EMOJI[place.type] ?? "📍"}
              fallbackCaption={(
                PLACE_TYPE_LABELS[place.type] ?? place.type
              ).toUpperCase()}
              kicker={`${(
                PLACE_TYPE_LABELS[place.type] ?? place.type
              ).toUpperCase()}  ·  ${
                place.status === "to_visit" || !place.visited_date
                  ? "PARA VISITAR"
                  : formatDateBR(place.visited_date)
              }`}
              title={place.name}
              score={
                place.rating != null && place.rating > 0
                  ? `${formatRating(place.rating)}/5`
                  : null
              }
              scoreLabel={
                place.rating != null && place.rating > 0
                  ? getRatingLabel(place.rating)
                  : null
              }
              recommend={place.would_recommend !== false}
              notes={includeNotes ? place.notes?.trim() : null}
            />
          )}
        />
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: { padding: Spacing.four, gap: Spacing.three },
  card: { padding: Spacing.three, gap: Spacing.two },
  input: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  visitHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  visitRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  visitCopy: { flex: 1, gap: 2 },
});
