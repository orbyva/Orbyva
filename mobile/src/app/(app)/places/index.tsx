import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { deletePlace, enrichPlacesWithOpinions, fetchPlaces } from "@/api/places/places";
import { ChipBar } from "@/components/ChipBar";
import { FilterRow, FilterSelect } from "@/components/FilterSelect";
import { SearchField } from "@/components/SearchField";
import { TypeIcon } from "@/components/TypeIcon";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Badge, Banner, Button, Card, EmptyState } from "@/components/ui";
import { Radius, Spacing } from "@/constants/theme";
import {
  filterPlaces,
  normalizePlaceStatus,
  PLACE_TYPE_LABELS,
  placeTypeMeta,
  type PlaceRatingFilter,
  type PlaceRecommendFilter,
} from "@/domain/places";
import {
  placeCardBadges,
  placeShortAddress,
  placesOverview,
  placeTypeCounts,
  type PlaceCardBadge,
} from "@/domain/places/listView";
import { useAppShell } from "@/hooks/use-app-shell";
import { useModuleColors, useTheme } from "@/hooks/use-theme";
import { tintedSurface } from "@/lib/color";
import { formatDateBR } from "@/lib/currency";
import { getErrorMessage } from "@/lib/errors";
import type { PlaceFilter, PlaceStatus, PlaceVisit } from "@/types/places";

const STATUS_CHIPS: { id: PlaceStatus; label: string }[] = [
  { id: "to_visit", label: "Para visitar" },
  { id: "visited", label: "Visitados" },
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

const BADGE_LOOK: Record<
  PlaceCardBadge["kind"],
  { icon: "star" | "airplane-outline" | "calendar-outline" | null }
> = {
  rating: { icon: "star" },
  recommend: { icon: null },
  trip: { icon: "airplane-outline" },
  date: { icon: "calendar-outline" },
};

function PlaceBadge({ badge }: { badge: PlaceCardBadge }) {
  if (badge.kind === "recommend") {
    return (
      <Badge
        label={badge.label}
        variant={badge.positive ? "success" : "destructive"}
        icon={badge.positive ? "thumbs-up-outline" : "thumbs-down-outline"}
      />
    );
  }
  const icon = BADGE_LOOK[badge.kind].icon ?? undefined;
  const variant = badge.kind === "rating" ? "warning" : badge.kind === "trip" ? "outline" : "secondary";
  return <Badge label={badge.label} variant={variant} icon={icon} />;
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <ThemedText type="title" style={styles.statValue}>
        {value}
      </ThemedText>
      <ThemedText type="small" themeColor="mutedForeground" numberOfLines={1}>
        {label}
      </ThemedText>
    </View>
  );
}

export default function PlacesScreen() {
  const theme = useTheme();
  const modules = useModuleColors();
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
    setPlaces(await enrichPlacesWithOpinions(await fetchPlaces()));
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

  function confirmDelete(place: PlaceVisit) {
    Alert.alert("Excluir lugar", place.name, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: () => {
          void deletePlace(place.id)
            .then(() =>
              setPlaces((cur) => cur.filter((row) => row.id !== place.id))
            )
            .catch((err) =>
              setError(getErrorMessage(err, "Não foi possível excluir."))
            );
        },
      },
    ]);
  }

  function changeStatus(next: PlaceStatus) {
    setStatusFilter(next);
    setCategory("all");
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

  const overview = useMemo(() => placesOverview(places), [places]);
  const typeCounts = useMemo(
    () => placeTypeCounts(places, statusFilter),
    [places, statusFilter]
  );
  const inTab = useMemo(
    () =>
      places.filter(
        (p) => normalizePlaceStatus(p.status, p.visited_date) === statusFilter
      ),
    [places, statusFilter]
  );
  const tripCount = inTab.filter((p) => p.trip_id).length;

  const quickFilters: {
    id: PlaceFilter;
    label: string;
    count: number;
    icon?: Parameters<typeof TypeIcon>[0]["name"];
    color?: { bg: string; fg: string };
  }[] = [
    { id: "all", label: "Todos", count: inTab.length },
    ...(tripCount > 0 && tripCount < inTab.length
      ? [
          { id: "trip" as const, label: "Em viagens", count: tripCount, icon: "plane" },
          { id: "local" as const, label: "Locais", count: inTab.length - tripCount, icon: "home" },
        ]
      : []),
    ...typeCounts.map(({ type, count }) => {
      const tone = placeTypeMeta(type);
      return {
        id: type,
        label: PLACE_TYPE_LABELS[type],
        count,
        icon: tone.icon,
        color: { bg: tone.bg, fg: tone.fg },
      };
    }),
  ];

  const filtering =
    category !== "all" ||
    search.trim() !== "" ||
    (statusFilter === "visited" && (ratingFilter !== "all" || recommendFilter !== "all"));

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
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void onRefresh()}
            />
          }
        >
          {places.length > 0 ? (
            <View style={[styles.overview, tintedSurface(modules.life)]}>
              <View style={styles.overviewHead}>
                <Ionicons name="location" size={16} color={modules.life} />
                <ThemedText type="smallBold" style={{ color: modules.life }}>
                  Seu mapa
                </ThemedText>
              </View>
              <View style={styles.stats}>
                <Stat value={String(overview.visited)} label="visitados" />
                <View style={[styles.statRule, { backgroundColor: theme.border }]} />
                <Stat value={String(overview.toVisit)} label="para visitar" />
                <View style={[styles.statRule, { backgroundColor: theme.border }]} />
                <Stat
                  value={overview.avgRating ? `${overview.avgRating}★` : "—"}
                  label={
                    overview.recommendPct != null
                      ? `${overview.recommendPct}% recomendo`
                      : "nota média"
                  }
                />
              </View>
            </View>
          ) : null}

          <ChipBar options={STATUS_CHIPS} value={statusFilter} onChange={changeStatus} />
          <SearchField
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar por nome, endereço ou comentário"
          />

          {inTab.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.quick}
            >
              {quickFilters.map((f) => {
                const selected = category === f.id;
                const fg = f.color?.fg ?? theme.primary;
                return (
                  <Pressable
                    key={f.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setCategory(selected && f.id !== "all" ? "all" : f.id)}
                    style={[
                      styles.quickChip,
                      {
                        borderColor: selected ? fg : theme.border,
                        backgroundColor: selected ? (f.color?.bg ?? theme.muted) : theme.card,
                      },
                    ]}
                  >
                    {f.icon ? (
                      <TypeIcon name={f.icon} color={f.color?.fg ?? theme.mutedForeground} size={14} />
                    ) : null}
                    <ThemedText
                      type={selected ? "smallBold" : "small"}
                      style={selected ? { color: fg } : undefined}
                    >
                      {f.label}
                    </ThemedText>
                    <ThemedText type="small" themeColor="mutedForeground">
                      {f.count}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}

          {statusFilter === "visited" && inTab.length > 0 ? (
            <FilterRow>
              <FilterSelect
                label="Nota"
                value={ratingFilter}
                options={RATING_CHIPS}
                onChange={(id) => setRatingFilter(id as PlaceRatingFilter)}
              />
              <FilterSelect
                label="Opinião"
                value={recommendFilter}
                options={RECOMMEND_CHIPS}
                onChange={(id) => setRecommendFilter(id as PlaceRecommendFilter)}
              />
            </FilterRow>
          ) : null}

          {visible.length === 0 ? (
            filtering ? (
              <EmptyState
                icon="search-outline"
                title="Nenhum lugar neste filtro"
                description="Tente outro tipo ou limpe a busca."
              />
            ) : (
              <EmptyState
                icon={statusFilter === "visited" ? "map-outline" : "bookmark-outline"}
                title={
                  statusFilter === "visited"
                    ? "Nenhum lugar visitado ainda"
                    : "Sua lista de desejos está vazia"
                }
                description={
                  statusFilter === "visited"
                    ? "Registre onde você foi, dê nota e diga se recomendaria."
                    : "Salve restaurantes, cafés e passeios que você quer conhecer."
                }
                action={
                  <Button
                    label="Novo lugar"
                    leftIcon="add"
                    onPress={() => router.push("/places/form")}
                  />
                }
              />
            )
          ) : (
            visible.map((place) => {
              const tone = placeTypeMeta(place.type);
              const where = placeShortAddress(place.address);
              const badges = placeCardBadges(place, formatDateBR);
              return (
                <Pressable
                  key={place.id}
                  accessibilityRole="button"
                  accessibilityHint="Toque e segure para excluir"
                  onPress={() =>
                    router.push({ pathname: "/places/[id]", params: { id: place.id } })
                  }
                  onLongPress={() => confirmDelete(place)}
                  style={({ pressed }) => pressed && styles.pressed}
                >
                  <Card style={styles.card}>
                    <View style={[styles.iconWell, { backgroundColor: tone.bg }]}>
                      <TypeIcon name={tone.icon} color={tone.fg} size={22} />
                    </View>
                    <View style={styles.copy}>
                      <ThemedText type="bodyStrong" numberOfLines={1}>
                        {place.name}
                      </ThemedText>
                      <ThemedText type="small" numberOfLines={1}>
                        <ThemedText type="smallBold" style={{ color: tone.fg }}>
                          {PLACE_TYPE_LABELS[place.type] ?? place.type}
                        </ThemedText>
                        {where ? (
                          <ThemedText type="small" themeColor="mutedForeground">
                            {`  ·  ${where}`}
                          </ThemedText>
                        ) : null}
                      </ThemedText>
                      {badges.length > 0 ? (
                        <View style={styles.badges}>
                          {badges.map((badge) => (
                            <PlaceBadge key={`${badge.kind}-${badge.label}`} badge={badge} />
                          ))}
                        </View>
                      ) : null}
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color={theme.mutedForeground}
                    />
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
  overview: {
    borderWidth: 1,
    borderRadius: Radius.xl,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  overviewHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  stats: { flexDirection: "row", alignItems: "stretch" },
  stat: { flex: 1, alignItems: "center", gap: 2 },
  statValue: { fontVariant: ["tabular-nums"] },
  statRule: { width: StyleSheet.hairlineWidth, marginVertical: 4 },
  quick: { gap: 8, paddingRight: Spacing.four },
  quickChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  pressed: { opacity: 0.85 },
  card: {
    padding: Spacing.three,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconWell: {
    width: 48,
    height: 48,
    borderRadius: Radius.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: { flex: 1, minWidth: 0, gap: 4 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
});
