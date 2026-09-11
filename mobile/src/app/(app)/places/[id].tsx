import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import {
  createPlaceVisitOccurrence,
  fetchPlaceById,
  fetchPlaceVisitOccurrences,
} from "@/api/places/places";
import { DateField } from "@/components/DateField";
import { LedgerClassField } from "@/components/LedgerClassField";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner } from "@/components/ui/Banner";
import { Card } from "@/components/ui/Card";
import { Spacing } from "@/constants/theme";
import {
  mapsSearchUrl,
  PLACE_STATUS_LABELS,
  PLACE_TYPE_LABELS,
} from "@/domain/places";
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
  const [linkLedger, setLinkLedger] = useState(false);
  const [classId, setClassId] = useState<number | null>(null);
  const [savingVisit, setSavingVisit] = useState(false);

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
              <Pressable onPress={() => void Linking.openURL(maps)}>
                <ThemedText type="linkPrimary">Abrir no mapa</ThemedText>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/places/form",
                  params: { id: place.id },
                })
              }
            >
              <ThemedText type="linkPrimary">Editar</ThemedText>
            </Pressable>
          </Card>
        ) : null}
        {place ? (
          <Card style={styles.card}>
            <ThemedText type="smallBold">Histórico de visitas</ThemedText>
            {visits.map((visit) => (
              <ThemedText key={visit.id} type="small" themeColor="textSecondary">
                {formatDateBR(visit.visited_date)}
                {visit.amount ? ` · ${formatBRL(visit.amount)}` : ""}
                {visit.transaction_id ? " · extrato" : ""}
              </ThemedText>
            ))}
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
            <LedgerClassField
              enabled={linkLedger}
              onEnabledChange={setLinkLedger}
              classId={classId}
              onClassIdChange={setClassId}
            />
            <Pressable
              disabled={savingVisit}
              onPress={() => {
                void (async () => {
                  setSavingVisit(true);
                  try {
                    const parsed = Number.parseFloat(visitAmount.replace(",", "."));
                    await createPlaceVisitOccurrence({
                      place_visit_id: place.id,
                      visited_date: visitDate,
                      amount:
                        Number.isFinite(parsed) && parsed > 0 ? parsed : null,
                      classId: linkLedger ? classId : null,
                    });
                    setVisitAmount("");
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
            >
              <ThemedText type="linkPrimary">
                {savingVisit ? "Salvando…" : "Registrar visita"}
              </ThemedText>
            </Pressable>
          </Card>
        ) : null}
      </ScrollView>
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
});
