import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { fetchPlaces } from "@/api/places/places";
import { ChipBar } from "@/components/ChipBar";
import { SearchField } from "@/components/SearchField";
import { TypeIcon } from "@/components/TypeIcon";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner } from "@/components/ui/Banner";
import { Card } from "@/components/ui/Card";
import { Spacing } from "@/constants/theme";
import {
  filterPlaces,
  getAverageRating,
  PLACE_TYPE_LABELS,
  placeTypeMeta,
  type PlaceRatingFilter,
  type PlaceRecommendFilter,
} from "@/domain/places";
import { useAppShell } from "@/hooks/use-app-shell";
import { useTheme } from "@/hooks/use-theme";
import { formatDateBR } from "@/lib/currency";
import { getErrorMessage } from "@/lib/errors";
import type { PlaceFilter, PlaceStatus, PlaceVisit } from "@/types/places";

const STATUS_CHIPS: { id: PlaceStatus; label: string }[] = [
  { id: "to_visit", label: "Para visitar" },
  { id: "visited", label: "Visitados" },
];

const CATEGORY_FILTERS: { id: PlaceFilter; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "local", label: "Locais" },
  { id: "trip", label: "Em viagens" },
  { id: "restaurant", label: "Restaurantes" },
  { id: "cafe", label: "Cafés" },
  { id: "bar", label: "Bares" },
  { id: "attraction", label: "Passeios" },
  { id: "hotel", label: "Hotéis" },
  { id: "park", label: "Parques" },
  { id: "museum", label: "Museus" },
  { id: "shop", label: "Lojas" },
  { id: "other", label: "Outros" },
];

const RATING_CHIPS: { id: PlaceRatingFilter; label: string }[] = [
  { id: "all", label: "Qualquer nota" },
  { id: "3", label: "3★+" },
  { id: "4", label: "4★+" },
  { id: "5", label: "5★" },
];

const RECOMMEND_CHIPS: { id: PlaceRecommendFilter; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "yes", label: "Recomendaria" },
  { id: "no", label: "Não recomendaria" },
];

export default function PlacesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { bottomInset } = useAppShell();
  const [places, setPlaces] = useState<PlaceVisit[]>([]);
  const [statusFilter, setStatusFilter] = useState<PlaceStatus>("to_visit");
  const [category, setCategory] = useState<PlaceFilter>("all");
  const [search, setSearch] = useState("");
  const [ratingFilter, setRatingFilter] = useState<PlaceRatingFilter>("all");
  const [recommendFilter, setRecommendFilter] =
    useState<PlaceRecommendFilter>("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasLoaded = useRef(false);

  const load = useCallback(async () => {
    setError(null);
    setPlaces(await fetchPlaces());
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (!hasLoaded.current) setLoading(true);
      void load()
        .catch((err) => {
          if (!cancelled) {
            setError(getErrorMessage(err, "Não foi possível carregar os lugares."));
          }
        })
        .finally(() => {
          if (!cancelled) {
            hasLoaded.current = true;
            setLoading(false);
          }
        });
      return () => {
        cancelled = true;
      };
    }, [load])
  );

  async function onRefresh() {
    setRefreshing(true);
    try {
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Não foi possível atualizar."));
    } finally {
      setRefreshing(false);
    }
  }

  const visible = useMemo(
    () =>
      filterPlaces(places, {
        category,
        search,
        rating: statusFilter === "visited" ? ratingFilter : "all",
        recommend: statusFilter === "visited" ? recommendFilter : "all",
        status: statusFilter,
      }),
    [places, category, search, ratingFilter, recommendFilter, statusFilter]
  );

  const visitedPlaces = useMemo(
    () => places.filter((place) => (place.status ?? "visited") === "visited"),
    [places]
  );
  const avgRating = getAverageRating(visitedPlaces);
  const recommendCount = visitedPlaces.filter(
    (place) => place.would_recommend !== false
  ).length;
  const recommendPct =
    visitedPlaces.length > 0
      ? Math.round((recommendCount / visitedPlaces.length) * 100)
      : null;

  return (
    <ThemedView style={styles.flex}>
      <Banner message={error} style={styles.banner} />
      {loading && places.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: bottomInset + 24 }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void onRefresh()}
            />
          }
        >
          {avgRating != null ? (
            <ThemedText type="small" themeColor="textSecondary">
              Média {avgRating}★
              {recommendPct != null ? ` · ${recommendPct}% recomendaria` : ""}
            </ThemedText>
          ) : null}
          <ChipBar
            options={STATUS_CHIPS}
            value={statusFilter}
            onChange={setStatusFilter}
          />
          <SearchField
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar por nome, endereço ou comentário"
          />
          <ChipBar
            options={CATEGORY_FILTERS}
            value={category}
            onChange={setCategory}
          />
          {statusFilter === "visited" ? (
            <>
              <ChipBar
                options={RATING_CHIPS}
                value={ratingFilter}
                onChange={setRatingFilter}
              />
              <ChipBar
                options={RECOMMEND_CHIPS}
                value={recommendFilter}
                onChange={setRecommendFilter}
              />
            </>
          ) : null}
          {visible.length === 0 ? (
            <ThemedText themeColor="textSecondary">
              Nenhum lugar neste filtro.
            </ThemedText>
          ) : (
            visible.map((place) => {
              const tone = placeTypeMeta(place.type);
              return (
                <Pressable
                  key={place.id}
                  onPress={() =>
                    router.push({ pathname: "/places/[id]", params: { id: place.id } })
                  }
                >
                  <Card style={styles.card}>
                    <View style={[styles.iconWell, { backgroundColor: tone.bg }]}>
                      <TypeIcon name={tone.icon} color={tone.fg} size={16} />
                    </View>
                    <View style={styles.copy}>
                      <ThemedText type="smallBold">{place.name}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {[
                          PLACE_TYPE_LABELS[place.type] ?? place.type,
                          place.rating ? `${place.rating.toFixed(1)}★` : null,
                          place.visited_date
                            ? formatDateBR(place.visited_date)
                            : null,
                          place.trip?.title,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </ThemedText>
                    </View>
                  </Card>
                </Pressable>
              );
            })
          )}
        </ScrollView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  banner: { marginHorizontal: Spacing.four, marginTop: Spacing.three },
  list: { padding: Spacing.four, gap: Spacing.three },
  card: {
    padding: Spacing.three,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconWell: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: { flex: 1, gap: 2 },
});
