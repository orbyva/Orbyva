import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";

import { fetchPlaces, linkPlaceToTrip } from "@/api/places/places";
import {
  leaveTrip,
  listTripMembers,
  removeTripMember,
} from "@/api/travel/members";
import {
  createTripInvite,
  createItineraryActivity,
  createTripMilestone,
  deleteItineraryActivity,
  deleteTrip,
  deleteTripExpense,
  deleteTripMilestone,
  fetchTripById,
  fetchTripExpenses,
  fetchTripItinerary,
  fetchTripMilestones,
  fetchTripStops,
  listTripInvites,
  revokeTripInvite,
  setItineraryVisitStatus,
  tripInviteUrl,
  updateItineraryActivity,
  updateTripMilestone,
} from "@/api/travel/travel";
import { OpinionShareSheet } from "@/components/share/OpinionShareSheet";
import { ActivityAssetsSheet } from "@/components/travel/ActivityAssetsSheet";
import { fetchAssetsForTrip } from "@/api/travel/activityAssets";
import { TripShareStoryCard } from "@/components/share/TripShareStoryCard";
import { ChipBar } from "@/components/ChipBar";
import { ChoiceChip } from "@/components/ChoiceChip";
import { DateField } from "@/components/DateField";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner, Button, Card, Input } from "@/components/ui";
import { TripItineraryComposer } from "@/components/travel/TripItineraryComposer";
import {
  ItinerarySavedPlaceSuggestions,
  parseSavedPlaceDragId,
} from "@/components/travel/ItinerarySavedPlaceSuggestions";
import { VisitDragHandle } from "@/components/travel/VisitDragHandle";
import { TypeIcon } from "@/components/TypeIcon";
import { Radius, Spacing } from "@/constants/theme";
import {
  CLOTHING_LABELS,
  CLOTHING_META,
  suggestClothingForDay,
  suggestPackingList,
} from "@/domain/travel/clothing";
import { tripWeatherStops } from "@/domain/travel/tripWeather";
import { CLOTHING_IONICONS, weatherIcon } from "@/components/travel/clothingIcons";
import { ItineraryDayWeather } from "@/components/travel/ItineraryDayWeather";
import { getTodayIso } from "@/domain/habits";
import { PLACE_TYPE_META, normalizePlaceStatus } from "@/domain/places";
import { formatDurationFriendly } from "@/domain/itinerary/duration";
import {
  describeDayOffset,
  formatWeekdayShortBR,
  normalizeVisitStatus,
  sortVisitsForDay,
} from "@/domain/itinerary/visits";
import {
  ACTIVITY_CATEGORY_LABELS,
  EXPENSE_CATEGORY_LABELS,
  getTripDuration,
  MILESTONE_TYPE_LABELS,
  normalizeTripActivityCategory,
  TRIP_STATUS_LABELS,
} from "@/domain/travel";
import { buildTripShareText } from "@/domain/share";
import {
  isTransportActivity,
  TRIP_TRANSPORT_MODE_LABELS,
  type TripTransportMode,
} from "@/domain/travel/transportModes";
import { stopForDate } from "@/domain/travel/tripStops";
import {
  collectItineraryPlaceIds,
  suggestionAnchorForDay,
  suggestionsForAnchor,
  type GeoAnchor,
} from "@/domain/travel/savedPlaceSuggestions";
import { useAppShell } from "@/hooks/use-app-shell";
import { scrim } from "@/domain/ui/color";
import { TypeScale } from "@/domain/ui/typography";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-toast";
import { useTripWeather } from "@/hooks/use-trip-weather";
import { hexAlpha } from "@/lib/color";
import { dragListLayout, useDropLanding } from "@/lib/dragMotion";
import { formatBRL, formatDateBR } from "@/lib/currency";
import { getErrorMessage } from "@/lib/errors";
import {
  persistDismissedSuggestionCity,
  readDismissedSuggestionCities,
} from "@/lib/savedPlaceSuggestionDismiss";
import { fetchTravelRoutes, type RouteLegResult } from "@/lib/googleRoutes";
import { getTripAccess, type TripAccess } from "@/lib/tripAccess";
import type { PlaceType, PlaceVisit } from "@/types/places";
import type {
  Trip,
  TripActivityAsset,
  TripExpense,
  TripInvite,
  TripItineraryActivity,
  TripItineraryDay,
  TripMember,
  TripMilestone,
  TripMilestoneType,
  TripStop,
} from "@/types/travel";

type Tab =
  | "resumo"
  | "paradas"
  | "roteiro"
  | "prazos"
  | "gastos"
  | "pessoas";

const TABS: { id: Tab; label: string }[] = [
  { id: "resumo", label: "Resumo" },
  { id: "paradas", label: "Paradas" },
  { id: "roteiro", label: "Roteiro" },
  { id: "prazos", label: "Prazos" },
  { id: "gastos", label: "Gastos" },
  { id: "pessoas", label: "Pessoas" },
];

function activityIconName(act: TripItineraryActivity): string {
  if (isTransportActivity(act)) {
    const mode = (act.transport_mode ?? "other") as TripTransportMode;
    if (mode === "flight") return "plane";
    if (mode === "train") return "train";
    if (mode === "bus") return "bus";
    if (mode === "car") return "car";
    return "map-pin";
  }
  const category = normalizeTripActivityCategory(act.category);
  if (category === "transport") return "plane";
  return PLACE_TYPE_META[category as PlaceType]?.icon ?? "pin";
}

function hhmm(value: string | null | undefined): string {
  return value?.trim().slice(0, 5) ?? "";
}

function activityTimeLabel(act: TripItineraryActivity): string | null {
  const start = hhmm(act.activity_time);
  const end = hhmm(act.arrival_time);
  if (start && end) return `${start} → ${end}`;
  if (start) return start;
  if (end) return `chegada ${end}`;
  return null;
}

export default function TripDetailScreen() {
  const theme = useTheme();
  const transferTint = theme.chart1;
  const navigation = useNavigation();
  const router = useRouter();
  const { fail, ok } = useFeedback();
  const { bottomInset } = useAppShell();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const [tab, setTab] = useState<Tab>("resumo");
  const [trip, setTrip] = useState<Trip | null>(null);
  const [stops, setStops] = useState<TripStop[]>([]);
  const [days, setDays] = useState<TripItineraryDay[]>([]);
  const [expenses, setExpenses] = useState<TripExpense[]>([]);
  const [invites, setInvites] = useState<TripInvite[]>([]);
  const [members, setMembers] = useState<TripMember[]>([]);
  const [milestones, setMilestones] = useState<TripMilestone[]>([]);
  const [access, setAccess] = useState<TripAccess | null>(null);
  const [assetsByActivity, setAssetsByActivity] = useState<Record<string, TripActivityAsset[]>>({});
  const [assetsActivity, setAssetsActivity] = useState<{ id: string; title: string } | null>(null);
  const [routes, setRoutes] = useState<
    { from: string; to: string; leg: RouteLegResult | null }[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [addingFor, setAddingFor] = useState<{
    dayId: string;
    kind: "visit" | "transfer";
  } | null>(null);
  const [editingActivity, setEditingActivity] =
    useState<TripItineraryActivity | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editTime, setEditTime] = useState("");
  const [milestoneTitle, setMilestoneTitle] = useState("");
  const [milestoneType, setMilestoneType] =
    useState<TripMilestoneType>("flight");
  const [milestoneDate, setMilestoneDate] = useState(getTodayIso());
  const [shareOpen, setShareOpen] = useState(false);
  const [tripPlaces, setTripPlaces] = useState<PlaceVisit[]>([]);
  const [savedPlaces, setSavedPlaces] = useState<PlaceVisit[]>([]);
  const [dismissedCities, setDismissedCities] = useState<GeoAnchor[]>([]);
  const [addingPlaceId, setAddingPlaceId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dayNodes = useRef(new Map<string, View>());
  const activityNodes = useRef(new Map<string, View>());
  const daysRef = useRef(days);
  daysRef.current = days;
  const rootRef = useRef<View>(null);
  const absX = useSharedValue(0);
  const absY = useSharedValue(0);
  const originX = useSharedValue(0);
  const originY = useSharedValue(0);
  const ghostVisible = useSharedValue(0);
  const { markLanded, landingKey, landingEntering } = useDropLanding();

  const ghostStyle = useAnimatedStyle(() => ({
    opacity: ghostVisible.value,
    transform: [
      { translateX: absX.value - originX.value - 20 },
      { translateY: absY.value - originY.value - 24 },
    ],
  }));

  const draggingAct = useMemo(() => {
    if (!draggingId) return null;
    for (const day of days) {
      const found = (day.activities ?? []).find((row) => row.id === draggingId);
      if (found) return found;
    }
    return null;
  }, [days, draggingId]);

  const draggingSavedPlace = useMemo(() => {
    const savedId = parseSavedPlaceDragId(draggingId);
    if (!savedId) return null;
    return (
      savedPlaces.find((place) => place.id === savedId) ??
      tripPlaces.find((place) => place.id === savedId) ??
      null
    );
  }, [draggingId, savedPlaces, tripPlaces]);

  const itineraryPlaceIds = useMemo(
    () => collectItineraryPlaceIds(days),
    [days]
  );
  const destinationFallback = useMemo(
    () =>
      trip?.destination_lat != null && trip.destination_lng != null
        ? {
            name: trip.destination ?? "",
            lat: trip.destination_lat,
            lng: trip.destination_lng,
            place_id: trip.destination_place_id ?? null,
          }
        : null,
    [
      trip?.destination,
      trip?.destination_lat,
      trip?.destination_lng,
      trip?.destination_place_id,
    ]
  );

  useEffect(() => {
    let cancelled = false;
    void readDismissedSuggestionCities(id).then((rows) => {
      if (!cancelled) setDismissedCities(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const load = useCallback(async () => {
    const [
      row,
      nextStops,
      nextDays,
      nextExpenses,
      nextInvites,
      nextMembers,
      nextMilestones,
      nextAccess,
      nextPlaces,
    ] = await Promise.all([
      fetchTripById(id),
      fetchTripStops(id),
      fetchTripItinerary(id).catch(() => []),
      fetchTripExpenses(id).catch(() => []),
      listTripInvites(id).catch(() => []),
      listTripMembers(id).catch(() => []),
      fetchTripMilestones(id).catch(() => []),
      getTripAccess(id),
      fetchPlaces().catch(() => []),
    ]);
    void fetchAssetsForTrip(id)
      .then(setAssetsByActivity)
      .catch(() => {});
    setTrip(row);
    setStops(nextStops);
    setDays(nextDays);
    setExpenses(nextExpenses);
    setInvites(nextInvites);
    setMembers(nextMembers);
    setMilestones(nextMilestones);
    setAccess(nextAccess);
    setTripPlaces(nextPlaces.filter((place) => place.trip_id === id));
    setSavedPlaces(
      nextPlaces.filter(
        (place) =>
          !place.trip_id &&
          normalizePlaceStatus(place.status, place.visited_date) === "to_visit"
      )
    );
    navigation.setOptions({ title: row?.title ?? "Viagem" });
    if (!row) setError("Viagem não encontrada.");

    const routed: { from: string; to: string; leg: RouteLegResult | null }[] =
      [];
    for (let i = 0; i < nextStops.length - 1; i++) {
      const from = nextStops[i];
      const to = nextStops[i + 1];
      if (
        from.lat == null ||
        from.lng == null ||
        to.lat == null ||
        to.lng == null
      ) {
        continue;
      }
      try {
        const legs = await fetchTravelRoutes({
          origin: { lat: from.lat, lng: from.lng },
          destination: to.place_id
            ? { placeId: to.place_id }
            : { lat: to.lat, lng: to.lng },
          modes: ["DRIVE"],
        });
        routed.push({
          from: from.name,
          to: to.name,
          leg: legs[0] ?? null,
        });
      } catch {
        routed.push({ from: from.name, to: to.name, leg: null });
      }
    }
    setRoutes(routed);
  }, [id, navigation]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      void load()
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
    }, [load])
  );

  const spent = useMemo(
    () => expenses.reduce((sum, row) => sum + Number(row.amount || 0), 0),
    [expenses]
  );
  const weatherStops = useMemo(
    () => tripWeatherStops(trip, stops),
    [trip, stops]
  );
  const weather = useTripWeather(weatherStops);
  const packing = useMemo(
    () =>
      weather.packingDays.length > 0
        ? suggestPackingList(weather.packingDays)
        : null,
    [weather.packingDays]
  );


  function patchVisitStatusLocal(
    actId: string,
    status: "pending" | "completed" | "skipped"
  ) {
    const now = new Date().toISOString();
    setDays((cur) =>
      cur.map((day) => ({
        ...day,
        activities: (day.activities ?? []).map((row) =>
          row.id === actId
            ? {
                ...row,
                visit_status: status,
                completed_at: status === "completed" ? now : null,
                skipped_at: status === "skipped" ? now : null,
              }
            : row
        ),
      }))
    );
  }

  function toggleVisitComplete(act: TripItineraryActivity) {
    if (isTransportActivity(act)) return;
    const current = normalizeVisitStatus(act.visit_status);
    const next = current === "pending" ? "completed" : "pending";
    patchVisitStatusLocal(act.id, next);
    void setItineraryVisitStatus(act.id, next).catch((err) => {
      fail(getErrorMessage(err, "Não foi possível atualizar o evento."));
      void fetchTripItinerary(id).then(setDays).catch(() => undefined);
    });
  }

  async function shareTrip() {
    if (!trip) return;
    try {
      const all = await fetchPlaces();
      setTripPlaces(all.filter((place) => place.trip_id === id));
    } catch {
      setTripPlaces([]);
    }
    setShareOpen(true);
  }

  function confirmDeleteTrip() {
    if (!trip) return;
    Alert.alert("Excluir viagem", trip.title, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: () => {
          void deleteTrip(trip.id)
            .then(() => router.replace("/travel"))
            .catch((err) =>
              fail(getErrorMessage(err, "Não foi possível excluir."))
            );
        },
      },
    ]);
  }

  function moveVisit(actId: string, targetDayId: string, targetIndex: number) {
    const sourceDay = daysRef.current.find((day) =>
      (day.activities ?? []).some((activity) => activity.id === actId)
    );
    const targetDay = daysRef.current.find((day) => day.id === targetDayId);
    const moving = sourceDay?.activities?.find(
      (activity) => activity.id === actId
    );
    if (!sourceDay || !targetDay || !moving) return;

    if (sourceDay.id === targetDayId && moving.activity_time) {
      fail(
        "Eventos com horário mudam de dia, mas a ordem no dia segue o relógio."
      );
      return;
    }

    const sourceWithout = sortVisitsForDay(
      (sourceDay.activities ?? []).filter((activity) => activity.id !== actId)
    );
    const targetWithout =
      sourceDay.id === targetDayId
        ? sourceWithout
        : sortVisitsForDay(
            (targetDay.activities ?? []).filter(
              (activity) => activity.id !== actId
            )
          );
    const moved = { ...moving, day_id: targetDayId };
    const nextTarget = [...targetWithout];
    nextTarget.splice(
      Math.max(0, Math.min(targetIndex, nextTarget.length)),
      0,
      moved
    );
    const normalizedTarget = nextTarget.map((activity, index) => ({
      ...activity,
      sort_order: index,
    }));
    const normalizedSource =
      sourceDay.id === targetDayId
        ? normalizedTarget
        : sourceWithout.map((activity, index) => ({
            ...activity,
            sort_order: index,
          }));

    markLanded(actId);
    setDays((cur) =>
      cur.map((day) => {
        if (day.id === targetDayId) return { ...day, activities: normalizedTarget };
        if (day.id === sourceDay.id) {
          return { ...day, activities: normalizedSource };
        }
        return day;
      })
    );

    const affected =
      sourceDay.id === targetDayId
        ? normalizedTarget
        : [...normalizedSource, ...normalizedTarget];
    void Promise.all(
      affected.map((activity) =>
        updateItineraryActivity({
          id: activity.id,
          day_id: activity.day_id,
          sort_order: activity.sort_order,
        })
      )
    ).catch((err) => {
      fail(getErrorMessage(err, "Não foi possível mover o evento."));
      void fetchTripItinerary(id).then(setDays);
    });
  }

  async function addSavedPlaceToDay(place: PlaceVisit, dayId: string) {
    if (addingPlaceId) return;
    setAddingPlaceId(place.id);
    try {
      if (place.trip_id !== id) {
        await linkPlaceToTrip(place.id, id);
        const linked = { ...place, trip_id: id };
        setTripPlaces((cur) => [
          linked,
          ...cur.filter((item) => item.id !== place.id),
        ]);
        setSavedPlaces((cur) => cur.filter((item) => item.id !== place.id));
      }
      const day = daysRef.current.find((item) => item.id === dayId);
      await createItineraryActivity({
        day_id: dayId,
        title: place.name.trim(),
        notes: place.notes?.trim() || null,
        category: place.type,
        place_visit_id: place.id,
        sort_order:
          Math.max(
            0,
            ...(day?.activities ?? []).map((act) => act.sort_order)
          ) + 1,
      });
      const next = await fetchTripItinerary(id);
      setDays(next);
      ok("Adicionado ao roteiro");
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível adicionar o lugar."));
    } finally {
      setAddingPlaceId(null);
    }
  }

  function dismissCity(city: GeoAnchor) {
    void persistDismissedSuggestionCity(id, city).then(setDismissedCities);
  }

  function onDragStart(actId: string) {
    setDraggingId(actId);
    rootRef.current?.measureInWindow((x, y) => {
      originX.value = x;
      originY.value = y;
    });
  }

  function onDragEnd(actId: string, x: number, y: number) {
    setDraggingId(null);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const dayEntries = [...dayNodes.current.entries()];
    if (dayEntries.length === 0) return;
    let pending = dayEntries.length;
    const dayRects = new Map<
      string,
      { x: number; y: number; w: number; h: number }
    >();
    const finishDays = () => {
      const targetDayId =
        [...dayRects.entries()].find(([, rect]) =>
          x >= rect.x &&
          x <= rect.x + rect.w &&
          y >= rect.y &&
          y <= rect.y + rect.h
        )?.[0] ?? null;
      if (!targetDayId) return;
      const savedId = parseSavedPlaceDragId(actId);
      if (savedId) {
        const place =
          savedPlaces.find((item) => item.id === savedId) ??
          tripPlaces.find((item) => item.id === savedId);
        if (place) void addSavedPlaceToDay(place, targetDayId);
        return;
      }
      const acts = sortVisitsForDay(
        daysRef.current.find((day) => day.id === targetDayId)?.activities ?? []
      ).filter((activity) => activity.id !== actId);
      if (acts.length === 0) {
        moveVisit(actId, targetDayId, 0);
        return;
      }
      let remaining = acts.length;
      const mids: { id: string; mid: number }[] = [];
      for (const act of acts) {
        const node = activityNodes.current.get(act.id);
        if (!node) {
          remaining -= 1;
          if (remaining === 0) {
            moveVisit(actId, targetDayId, acts.length);
          }
          continue;
        }
        node.measureInWindow((_ax, ay, _aw, ah) => {
          mids.push({ id: act.id, mid: ay + ah / 2 });
          remaining -= 1;
          if (remaining === 0) {
            mids.sort((a, b) => a.mid - b.mid);
            const index = mids.findIndex((row) => y < row.mid);
            moveVisit(actId, targetDayId, index < 0 ? mids.length : index);
          }
        });
      }
    };
    for (const [dayId, node] of dayEntries) {
      node.measureInWindow((mx, my, w, h) => {
        dayRects.set(dayId, { x: mx, y: my, w, h });
        pending -= 1;
        if (pending === 0) finishDays();
      });
    }
  }

  if (loading && !trip) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator color={theme.primary} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.flex}>
      <View
        ref={rootRef}
        collapsable={false}
        style={styles.flex}
        onLayout={() => {
          rootRef.current?.measureInWindow((x, y) => {
            originX.value = x;
            originY.value = y;
          });
        }}
      >
      <ScrollView
        scrollEnabled={!draggingId}
        contentContainerStyle={[styles.body, { paddingBottom: bottomInset + 24 }]}
      >
        <Banner message={error} />
        <ChipBar options={TABS} value={tab} onChange={setTab} />
        {trip && tab === "resumo" ? (
          <>
            <Card style={styles.card}>
              <View style={styles.summaryHead}>
                <View style={styles.flex}>
                  <ThemedText type="title">{trip.title}</ThemedText>
                  {trip.destination ? (
                    <View style={styles.metaRow}>
                      <Ionicons
                        name="location-outline"
                        size={14}
                        color={theme.mutedForeground}
                      />
                      <ThemedText type="small" themeColor="mutedForeground">
                        {trip.destination}
                      </ThemedText>
                    </View>
                  ) : null}
                </View>
                <View style={styles.iconActions}>
                  <Pressable
                    accessibilityLabel="Compartilhar viagem"
                    hitSlop={8}
                    onPress={() => void shareTrip()}
                    style={[
                      styles.iconBtn,
                      { backgroundColor: hexAlpha(theme.primary, 0.12) },
                    ]}
                  >
                    <Ionicons
                      name="share-outline"
                      size={18}
                      color={theme.primary}
                    />
                  </Pressable>
                  <Pressable
                    accessibilityLabel="Editar viagem"
                    hitSlop={8}
                    onPress={() =>
                      router.push({
                        pathname: "/travel/form",
                        params: { id: trip.id },
                      })
                    }
                    style={[
                      styles.iconBtn,
                      { backgroundColor: hexAlpha(theme.primary, 0.12) },
                    ]}
                  >
                    <Ionicons
                      name="create-outline"
                      size={18}
                      color={theme.primary}
                    />
                  </Pressable>
                  {access?.isOwner ? (
                    <Pressable
                      accessibilityLabel="Excluir viagem"
                      hitSlop={8}
                      onPress={confirmDeleteTrip}
                      style={[
                        styles.iconBtn,
                        { backgroundColor: hexAlpha(theme.destructive, 0.12) },
                      ]}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={18}
                        color={theme.destructive}
                      />
                    </Pressable>
                  ) : null}
                </View>
              </View>
              <View style={styles.metaChips}>
                <View style={styles.metaChip}>
                  <Ionicons
                    name="flag-outline"
                    size={14}
                    color={theme.mutedForeground}
                  />
                  <ThemedText type="small">
                    {TRIP_STATUS_LABELS[trip.status]}
                  </ThemedText>
                </View>
                <View style={styles.metaChip}>
                  <Ionicons
                    name="calendar-outline"
                    size={14}
                    color={theme.mutedForeground}
                  />
                  <ThemedText type="small">
                    {formatDateBR(trip.start_date)} –{" "}
                    {formatDateBR(trip.end_date)}
                  </ThemedText>
                </View>
                <View style={styles.metaChip}>
                  <Ionicons
                    name="time-outline"
                    size={14}
                    color={theme.mutedForeground}
                  />
                  <ThemedText type="small">
                    {getTripDuration(trip.start_date, trip.end_date)} dias
                  </ThemedText>
                </View>
                {spent > 0 ? (
                  <View style={styles.metaChip}>
                    <Ionicons
                      name="wallet-outline"
                      size={14}
                      color={theme.mutedForeground}
                    />
                    <ThemedText type="small">{formatBRL(spent)}</ThemedText>
                  </View>
                ) : null}
              </View>
              {trip.notes ? <ThemedText>{trip.notes}</ThemedText> : null}
            </Card>
            <Card style={styles.card}>
              <View style={styles.sectionHead}>
                <Ionicons
                  name="partly-sunny-outline"
                  size={18}
                  color={theme.primary}
                />
                <ThemedText type="smallBold">Clima e mala</ThemedText>
              </View>
              {weatherStops.length === 0 ? (
                <ThemedText type="small" themeColor="mutedForeground">
                  Adicione paradas com cidade no mapa para ver o clima.
                </ThemedText>
              ) : weather.loading ? (
                <View style={styles.weatherRow}>
                  <ActivityIndicator size="small" />
                  <ThemedText type="small" themeColor="mutedForeground">
                    Carregando previsão…
                  </ThemedText>
                </View>
              ) : weather.error ? (
                <ThemedText type="small" themeColor="mutedForeground">
                  {weather.error}
                </ThemedText>
              ) : weather.packingDays.length === 0 ? (
                <ThemedText type="small" themeColor="mutedForeground">
                  Sem previsão para o período da viagem. Ela aparece até 10
                  dias antes de cada parada.
                </ThemedText>
              ) : (
                <>
                  {weather.packingDays.map((day, index) => {
                    const suggestion = suggestClothingForDay(day);
                    const stopName =
                      weatherStops.length > 1 && day.date
                        ? stopForDate(stops, day.date)?.name ?? null
                        : null;
                    return (
                      <View
                        key={`${day.date ?? "dia"}-${index}`}
                        style={styles.weatherRow}
                      >
                        <Ionicons
                          name={weatherIcon(day.conditionText)}
                          size={20}
                          color={theme.primary}
                        />
                        <View style={styles.flex}>
                          <ThemedText type="smallBold">
                            {day.date ? formatDateBR(day.date) : "Dia"}
                            {stopName ? ` · ${stopName}` : ""}
                            {day.maxTemperatureC != null
                              ? ` · ${Math.round(day.maxTemperatureC)}°`
                              : ""}
                          </ThemedText>
                          <ThemedText type="small" themeColor="mutedForeground">
                            {[day.conditionText, suggestion.outfitPhrase]
                              .filter(Boolean)
                              .join(" · ")}
                          </ThemedText>
                        </View>
                      </View>
                    );
                  })}
                  {packing ? (
                    <ThemedText type="smallBold">
                      O que levar na mala
                    </ThemedText>
                  ) : null}
                  {packing?.summary ? (
                    <ThemedText type="small" themeColor="mutedForeground">
                      {packing.summary}
                    </ThemedText>
                  ) : null}
                  {packing ? (
                    <View style={styles.packWrap}>
                      {packing.items.map((item) => {
                        const meta = CLOTHING_META[item];
                        return (
                          <View
                            key={item}
                            style={[
                              styles.packChip,
                              {
                                backgroundColor: hexAlpha(theme.primary, 0.1),
                              },
                            ]}
                          >
                            <Ionicons
                              name={CLOTHING_IONICONS[meta.icon]}
                              size={14}
                              color={theme.primary}
                            />
                            <ThemedText type="small">
                              {CLOTHING_LABELS[item]}
                            </ThemedText>
                          </View>
                        );
                      })}
                    </View>
                  ) : null}
                </>
              )}
            </Card>
            <Card style={styles.card}>
              <View style={styles.sectionHead}>
                <Ionicons
                  name="mail-outline"
                  size={18}
                  color={theme.primary}
                />
                <ThemedText type="smallBold">Convites</ThemedText>
              </View>
              <ThemedText type="small" themeColor="mutedForeground">
                Quem receber o link pode abrir no app ou colar o token em
                Viagens.
              </ThemedText>
              {invites.map((invite) => (
                <View key={invite.id} style={styles.inviteRow}>
                  <View style={styles.flex}>
                    <ThemedText type="smallBold" numberOfLines={2}>
                      {tripInviteUrl(invite.token)}
                    </ThemedText>
                  </View>
                  <Pressable
                    accessibilityLabel="Compartilhar convite"
                    hitSlop={8}
                    onPress={() => {
                      void Share.share({
                        message: tripInviteUrl(invite.token),
                      });
                    }}
                    style={styles.iconBtn}
                  >
                    <Ionicons
                      name="share-outline"
                      size={18}
                      color={theme.primary}
                    />
                  </Pressable>
                  <Pressable
                    accessibilityLabel="Revogar convite"
                    hitSlop={8}
                    onPress={() => {
                      void revokeTripInvite(invite.id)
                        .then(() =>
                          setInvites((cur) =>
                            cur.filter((row) => row.id !== invite.id)
                          )
                        )
                        .catch((err) =>
                          fail(
                            getErrorMessage(err, "Não foi possível revogar.")
                          )
                        );
                    }}
                    style={styles.iconBtn}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={18}
                      color={theme.destructive}
                    />
                  </Pressable>
                </View>
              ))}
              <Button
                label="Gerar link de convite"
                onPress={() => {
                  void createTripInvite(id)
                    .then((invite) => {
                      setInvites((cur) => [invite, ...cur]);
                      ok("Convite criado");
                    })
                    .catch((err) =>
                      fail(
                        getErrorMessage(err, "Não foi possível criar o convite.")
                      )
                    );
                }}
                size="lg"
              />
            </Card>
            {access?.isOwner ? (
              <Button
                label="Excluir viagem"
                onPress={confirmDeleteTrip}
                variant="destructive"
              />
            ) : null}
          </>
        ) : null}
        {tab === "paradas" ? (
          <>
            {stops.length === 0 ? (
              <ThemedText themeColor="mutedForeground">
                Nenhuma parada. Edite a viagem para adicionar cidades.
              </ThemedText>
            ) : (
              stops.map((stop) => (
                <Card key={stop.id} style={styles.card}>
                  <ThemedText type="smallBold">{stop.name}</ThemedText>
                  <ThemedText type="small" themeColor="mutedForeground">
                    {formatDateBR(stop.start_date)} – {formatDateBR(stop.end_date)}
                  </ThemedText>
                </Card>
              ))
            )}
            {routes.map((route) => (
              <ThemedText
                key={`${route.from}-${route.to}`}
                type="small"
                themeColor="mutedForeground"
              >
                {route.from} → {route.to}
                {route.leg?.available
                  ? ` · ${formatDurationFriendly(route.leg.durationSeconds)}${
                      route.leg.distanceMeters
                        ? ` · ${(route.leg.distanceMeters / 1000).toFixed(1)} km`
                        : ""
                    }`
                  : " · rota indisponível"}
              </ThemedText>
            ))}
          </>
        ) : null}
        {tab === "roteiro" ? (
          <>
            {days.length === 0 ? (
              <ThemedText themeColor="mutedForeground">
                Sem dias de roteiro ainda.
              </ThemedText>
            ) : (
              days.map((day) => {
                const { kind, label: offsetLabel } = describeDayOffset({
                  dayDate: day.date,
                  todayIso: getTodayIso(),
                });
                const isToday = kind === "today";
                const weekday = formatWeekdayShortBR(day.date);
                const dayOfMonth = day.date ? day.date.slice(8, 10) : null;
                const dateLabel = day.date ? formatDateBR(day.date) : null;
                const stop = day.date ? stopForDate(stops, day.date) : null;
                const stopName = stop?.name?.trim() || null;
                const dayTitle = day.title?.trim();
                const heading = [dayTitle || `Dia ${day.day_number}`, stopName]
                  .filter(Boolean)
                  .join(" · ");
                const suggestionAnchor = suggestionAnchorForDay({
                  date: day.date,
                  stops,
                  fallback: destinationFallback,
                });
                const suggestedPlaces = suggestionAnchor
                  ? suggestionsForAnchor({
                      candidates: [...tripPlaces, ...savedPlaces],
                      anchor: suggestionAnchor,
                      tripId: id,
                      itineraryPlaceIds,
                      dismissed: dismissedCities,
                    })
                  : [];
                return (
                <View
                  key={day.id}
                  ref={(node) => {
                    if (node) dayNodes.current.set(day.id, node);
                    else dayNodes.current.delete(day.id);
                  }}
                  collapsable={false}
                >
                <Card style={styles.card}>
                  <View style={styles.dayHead}>
                    <View
                      style={[
                        styles.dayCal,
                        {
                          backgroundColor: isToday
                            ? hexAlpha(theme.primary, 0.15)
                            : theme.muted,
                        },
                      ]}
                    >
                      <ThemedText
                        type="small"
                        themeColor={isToday ? "primary" : "mutedForeground"}
                        style={styles.dayWeekday}
                      >
                        {weekday?.toUpperCase() ?? "DIA"}
                      </ThemedText>
                      <ThemedText
                        type="smallBold"
                        style={
                          isToday ? { color: theme.primary } : undefined
                        }
                      >
                        {dayOfMonth ?? String(day.day_number)}
                      </ThemedText>
                    </View>
                    <View style={styles.flex}>
                      <View style={styles.dayTitleRow}>
                        <ThemedText
                          type="smallBold"
                          numberOfLines={1}
                          style={styles.flex}
                        >
                          {heading}
                        </ThemedText>
                        {offsetLabel ? (
                          <ThemedText
                            type="small"
                            themeColor="mutedForeground"
                          >
                            {offsetLabel}
                          </ThemedText>
                        ) : null}
                      </View>
                      <ThemedText type="small" themeColor="mutedForeground">
                        {dateLabel ?? `Dia ${day.day_number}`}
                        {dayTitle ? ` · Dia ${day.day_number}` : ""}
                      </ThemedText>
                    </View>
                  </View>
                  <ItineraryDayWeather
                    weather={weather}
                    lat={stop?.lat ?? trip?.destination_lat}
                    lng={stop?.lng ?? trip?.destination_lng}
                    dayDate={day.date}
                    stopLabel={stop?.name ?? null}
                    isToday={isToday}
                  />
                  {suggestionAnchor && suggestedPlaces.length > 0 ? (
                    <ItinerarySavedPlaceSuggestions
                      tripId={id}
                      city={suggestionAnchor}
                      places={suggestedPlaces}
                      addingPlaceId={addingPlaceId}
                      absX={absX}
                      absY={absY}
                      ghostVisible={ghostVisible}
                      onDragStart={onDragStart}
                      onDragEnd={onDragEnd}
                      onAdd={(place) => void addSavedPlaceToDay(place, day.id)}
                      onDismiss={dismissCity}
                    />
                  ) : null}
                  {(day.activities ?? []).length === 0 ? (
                    <ThemedText type="small" themeColor="mutedForeground">
                      Nenhum evento neste dia.
                    </ThemedText>
                  ) : null}
                  {sortVisitsForDay(day.activities ?? []).map((act) => {
                    const place = act.place_visit_id
                      ? tripPlaces.find((row) => row.id === act.place_visit_id)
                      : null;
                    const category = normalizeTripActivityCategory(act.category);
                    const timeLabel = activityTimeLabel(act);
                    const transfer = isTransportActivity(act);
                    const status = normalizeVisitStatus(act.visit_status);
                    const done = status === "completed" || status === "skipped";
                    const modeLabel = transfer
                      ? TRIP_TRANSPORT_MODE_LABELS[
                          ((act.transport_mode ?? "other") as TripTransportMode)
                        ]
                      : null;
                    return (
                      <Animated.View
                        key={landingKey(act.id)}
                        layout={dragListLayout}
                        entering={landingEntering(act.id)}
                        ref={(node: View | null) => {
                          if (node) activityNodes.current.set(act.id, node);
                          else activityNodes.current.delete(act.id);
                        }}
                        collapsable={false}
                        style={[
                          styles.activityItem,
                          draggingId === act.id ? { opacity: 0.35 } : null,
                          transfer && status === "pending"
                            ? {
                                borderColor: hexAlpha(transferTint, 0.25),
                                backgroundColor: hexAlpha(transferTint, 0.04),
                              }
                            : null,
                          !transfer && status === "pending"
                            ? {
                                borderColor: hexAlpha(theme.foreground, 0.08),
                                backgroundColor: "transparent",
                              }
                            : null,
                          status === "completed"
                            ? {
                                borderColor: hexAlpha(theme.success, 0.25),
                                backgroundColor: hexAlpha(theme.success, 0.06),
                              }
                            : null,
                          status === "skipped"
                            ? {
                                borderColor: theme.border,
                                backgroundColor: hexAlpha(theme.foreground, 0.04),
                              }
                            : null,
                        ]}
                      >
                        <VisitDragHandle
                          id={act.id}
                          absX={absX}
                          absY={absY}
                          ghostVisible={ghostVisible}
                          onDragStart={onDragStart}
                          onDragEnd={onDragEnd}
                        />
                        {transfer ? (
                          <View
                            style={[
                              styles.activityIcon,
                              {
                                borderRadius: Radius.md,
                                borderWidth: 1,
                                borderColor: hexAlpha(transferTint, 0.3),
                                backgroundColor: hexAlpha(transferTint, 0.1),
                              },
                            ]}
                          >
                            <TypeIcon
                              name={activityIconName(act)}
                              color={transferTint}
                              size={16}
                            />
                          </View>
                        ) : (
                          <Pressable
                            accessibilityLabel={
                              status === "pending"
                                ? `Marcar ${act.title} como concluída`
                                : `Reabrir ${act.title}`
                            }
                            accessibilityState={{ selected: status === "completed" }}
                            hitSlop={4}
                            onPress={() => toggleVisitComplete(act)}
                            style={[
                              styles.activityIcon,
                              {
                                borderRadius: Radius.md,
                                borderWidth: 1,
                                borderColor:
                                  status === "completed"
                                    ? theme.success
                                    : "transparent",
                                backgroundColor:
                                  status === "completed"
                                    ? theme.success
                                    : hexAlpha(theme.primary, 0.12),
                              },
                            ]}
                          >
                            {status === "completed" ? (
                              <Ionicons
                                name="checkmark"
                                size={16}
                                color={theme.successForeground}
                              />
                            ) : (
                              <TypeIcon
                                name={activityIconName(act)}
                                color={theme.primary}
                                size={16}
                              />
                            )}
                          </Pressable>
                        )}
                        <Pressable
                          style={styles.flex}
                          onPress={() => {
                            setEditingActivity(act);
                            setEditTitle(act.title);
                            setEditNotes(act.notes ?? "");
                            setEditTime(hhmm(act.activity_time));
                          }}
                        >
                          {transfer ? (
                            <ThemedText
                              type="small"
                              style={{
                                ...TypeScale.nano,
                                color: transferTint,
                                letterSpacing: 0.4,
                                textTransform: "uppercase",
                              }}
                            >
                              Deslocamento
                              {modeLabel ? ` · ${modeLabel}` : ""}
                            </ThemedText>
                          ) : null}
                          {timeLabel ? (
                            <ThemedText type="small" themeColor="mutedForeground">
                              {timeLabel}
                            </ThemedText>
                          ) : null}
                          <ThemedText
                            type="smallBold"
                            style={done ? styles.done : undefined}
                          >
                            {act.title}
                          </ThemedText>
                          {transfer ? null : (
                            <ThemedText type="small" themeColor="mutedForeground">
                              {
                                ACTIVITY_CATEGORY_LABELS[
                                  place?.type ?? category
                                ]
                              }
                            </ThemedText>
                          )}
                          {act.notes?.trim() ? (
                            <ThemedText
                              type="small"
                              themeColor="mutedForeground"
                            >
                              {act.notes.trim()}
                            </ThemedText>
                          ) : null}
                        </Pressable>
                        <Pressable
                          accessibilityLabel={`Anexos de ${act.title}`}
                          hitSlop={8}
                          onPress={() => setAssetsActivity({ id: act.id, title: act.title })}
                          style={styles.assetButton}
                        >
                          <Ionicons
                            name="attach-outline"
                            size={18}
                            color={
                              (assetsByActivity[act.id]?.length ?? 0) > 0
                                ? theme.primary
                                : theme.mutedForeground
                            }
                          />
                          {(assetsByActivity[act.id]?.length ?? 0) > 0 ? (
                            <ThemedText type="small" style={{ color: theme.primary }}>
                              {assetsByActivity[act.id].length}
                            </ThemedText>
                          ) : null}
                        </Pressable>
                        <Pressable
                          accessibilityLabel="Excluir do roteiro"
                          hitSlop={8}
                          onPress={() => {
                            Alert.alert(
                              transfer
                                ? "Excluir este deslocamento?"
                                : "Excluir este evento?",
                              act.title,
                              [
                                { text: "Cancelar", style: "cancel" },
                                {
                                  text: "Excluir",
                                  style: "destructive",
                                  onPress: () => {
                                    void deleteItineraryActivity(act.id)
                                      .then(() =>
                                        setDays((cur) =>
                                          cur.map((d) =>
                                            d.id === day.id
                                              ? {
                                                  ...d,
                                                  activities: (
                                                    d.activities ?? []
                                                  ).filter(
                                                    (a) => a.id !== act.id
                                                  ),
                                                }
                                              : d
                                          )
                                        )
                                      )
                                      .catch((err) =>
                                        fail(
                                          getErrorMessage(
                                            err,
                                            "Não foi possível excluir."
                                          )
                                        )
                                      );
                                  },
                                },
                              ]
                            );
                          }}
                          style={styles.iconBtn}
                        >
                          <Ionicons
                            name="trash-outline"
                            size={18}
                            color={theme.destructive}
                          />
                        </Pressable>
                      </Animated.View>
                    );
                  })}
                  <View style={styles.addRow}>
                    <Button
                      label="Adicionar evento"
                      onPress={() =>
                        setAddingFor({ dayId: day.id, kind: "visit" })
                      }
                      variant="outline"
                      style={{ flex: 1 }}
                    />
                    <Pressable
                      accessibilityLabel="Adicionar deslocamento"
                      onPress={() =>
                        setAddingFor({ dayId: day.id, kind: "transfer" })
                      }
                      style={[
                        styles.transferBtn,
                        {
                          borderColor: hexAlpha(theme.primary, 0.4),
                          backgroundColor: hexAlpha(theme.primary, 0.08),
                        },
                      ]}
                    >
                      <Ionicons
                        name="airplane-outline"
                        size={18}
                        color={theme.primary}
                      />
                    </Pressable>
                  </View>
                  {addingFor?.dayId === day.id ? (
                    <TripItineraryComposer
                      tripId={id}
                      dayId={day.id}
                      kind={addingFor.kind}
                      tripPlaces={tripPlaces}
                      onCreated={async () => {
                        const next = await fetchTripItinerary(id);
                        setDays(next);
                      }}
                      onPlaceCreated={(place) =>
                        setTripPlaces((cur) => [place, ...cur])
                      }
                      onCancel={() => setAddingFor(null)}
                      fail={fail}
                      sortOrder={
                        Math.max(
                          0,
                          ...(day.activities ?? []).map((act) => act.sort_order)
                        ) + 1
                      }
                    />
                  ) : null}
                </Card>
                </View>
                );
              })
            )}
            {editingActivity ? (
              <Card style={styles.card}>
                <View style={styles.sectionHead}>
                  <Ionicons
                    name="create-outline"
                    size={18}
                    color={theme.primary}
                  />
                  <ThemedText type="smallBold">Editar item</ThemedText>
                </View>
                <Input
                  value={editTitle}
                  onChangeText={setEditTitle}
                />
                <Input
                  placeholder="Horário (ex. 09:30)"
                  value={editTime}
                  onChangeText={setEditTime}
                />
                {isTransportActivity(editingActivity) ? null : (
                  <Input
                    placeholder="Observação do evento — opcional"
                    value={editNotes}
                    onChangeText={setEditNotes}
                  />
                )}
                {editingActivity.place_visit_id ? (
                  <Button
                    label="Abrir lugar"
                    onPress={() => {
                      const placeId = editingActivity.place_visit_id;
                      if (!placeId) return;
                      setEditingActivity(null);
                      router.push({
                        pathname: "/places/[id]",
                        params: { id: placeId },
                      });
                    }}
                    variant="outline"
                  />
                ) : null}
                <Button
                  label="Salvar"
                  onPress={() => {
                    void updateItineraryActivity({
                      id: editingActivity.id,
                      title: editTitle.trim(),
                      notes: editNotes.trim() || null,
                      activity_time: editTime.trim() || null,
                    })
                      .then(() => fetchTripItinerary(id))
                      .then((next) => {
                        setDays(next);
                        setEditingActivity(null);
                      })
                      .catch((err) =>
                        fail(getErrorMessage(err, "Não foi possível salvar."))
                      );
                  }}
                  size="lg"
                />
                <Button
                  label="Cancelar"
                  onPress={() => setEditingActivity(null)}
                  variant="outline"
                />
              </Card>
            ) : null}
          </>
        ) : null}
        {tab === "prazos" ? (
          <Card style={styles.card}>
            <View style={styles.sectionHead}>
              <Ionicons
                name="alarm-outline"
                size={18}
                color={theme.primary}
              />
              <ThemedText type="smallBold">Prazos</ThemedText>
            </View>
            {milestones.length === 0 ? (
              <ThemedText type="small" themeColor="mutedForeground">
                Nenhum prazo ainda.
              </ThemedText>
            ) : (
              milestones.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => {
                    void updateTripMilestone({
                      id: item.id,
                      done: !item.done,
                    })
                      .then(() =>
                        setMilestones((cur) =>
                          cur.map((row) =>
                            row.id === item.id
                              ? { ...row, done: !row.done }
                              : row
                          )
                        )
                      )
                      .catch((err) =>
                        fail(
                          getErrorMessage(err, "Não foi possível atualizar.")
                        )
                      );
                  }}
                  onLongPress={() => {
                    Alert.alert("Excluir prazo", item.title, [
                      { text: "Cancelar", style: "cancel" },
                      {
                        text: "Excluir",
                        style: "destructive",
                        onPress: () => {
                          void deleteTripMilestone(item.id)
                            .then(() =>
                              setMilestones((cur) =>
                                cur.filter((row) => row.id !== item.id)
                              )
                            )
                            .catch((err) =>
                              fail(
                                getErrorMessage(
                                  err,
                                  "Não foi possível excluir."
                                )
                              )
                            );
                        },
                      },
                    ]);
                  }}
                  style={styles.listRow}
                >
                  <Ionicons
                    name={item.done ? "checkbox-outline" : "square-outline"}
                    size={18}
                    color={item.done ? theme.primary : theme.mutedForeground}
                  />
                  <View style={styles.flex}>
                    <ThemedText
                      type="smallBold"
                      style={item.done ? styles.done : undefined}
                    >
                      {item.title}
                    </ThemedText>
                    <ThemedText type="small" themeColor="mutedForeground">
                      {MILESTONE_TYPE_LABELS[item.type] ?? item.type} ·{" "}
                      {formatDateBR(item.due_date)}
                    </ThemedText>
                  </View>
                </Pressable>
              ))
            )}
            <Input
              placeholder="Título do prazo"
              value={milestoneTitle}
              onChangeText={setMilestoneTitle}
            />
            <DateField
              value={milestoneDate}
              onChange={setMilestoneDate}
            />
            <View style={styles.chips}>
              {(Object.keys(MILESTONE_TYPE_LABELS) as TripMilestoneType[]).map(
                (type) => (
                  <ChoiceChip
                    key={type}
                    label={MILESTONE_TYPE_LABELS[type]}
                    active={milestoneType === type}
                    onPress={() => setMilestoneType(type)}
                  />
                )
              )}
            </View>
            <Button
              label="Adicionar prazo"
              onPress={() => {
                if (!milestoneTitle.trim()) return;
                void createTripMilestone({
                  trip_id: id,
                  title: milestoneTitle,
                  type: milestoneType,
                  due_date: milestoneDate,
                })
                  .then((row) => {
                    setMilestones((cur) =>
                      [...cur, row].sort((a, b) =>
                        a.due_date.localeCompare(b.due_date)
                      )
                    );
                    setMilestoneTitle("");
                  })
                  .catch((err) =>
                    fail(getErrorMessage(err, "Não foi possível adicionar."))
                  );
              }}
              variant="outline"
            />
          </Card>
        ) : null}
        {tab === "gastos" ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Novo gasto"
              onPress={() =>
                router.push({
                  pathname: "/travel/expense-form",
                  params: { tripId: id },
                })
              }
              style={[
                styles.expenseCta,
                {
                  backgroundColor: hexAlpha(theme.primary, 0.1),
                  borderColor: hexAlpha(theme.primary, 0.28),
                },
              ]}
            >
              <View
                style={[
                  styles.expenseCtaIcon,
                  { backgroundColor: hexAlpha(theme.primary, 0.16) },
                ]}
              >
                <Ionicons
                  name="wallet-outline"
                  size={20}
                  color={theme.primary}
                />
              </View>
              <View style={styles.flex}>
                <ThemedText type="smallBold">Novo gasto</ThemedText>
                <ThemedText type="small" themeColor="mutedForeground">
                  Registrar um gasto desta viagem
                </ThemedText>
              </View>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={theme.primary}
              />
            </Pressable>
            {expenses.map((row) => (
              <Pressable
                key={row.id}
                onPress={() =>
                  router.push({
                    pathname: "/travel/expense-form",
                    params: { tripId: id, id: row.id },
                  })
                }
                onLongPress={() => {
                  Alert.alert("Excluir gasto", row.description, [
                    { text: "Cancelar", style: "cancel" },
                    {
                      text: "Excluir",
                      style: "destructive",
                      onPress: () => {
                        void deleteTripExpense(row.id)
                          .then(() =>
                            setExpenses((cur) =>
                              cur.filter((item) => item.id !== row.id)
                            )
                          )
                          .catch((err) =>
                            fail(
                              getErrorMessage(err, "Não foi possível excluir.")
                            )
                          );
                      },
                    },
                  ]);
                }}
              >
                <Card style={styles.card}>
                  <ThemedText type="smallBold">{row.description}</ThemedText>
                  <ThemedText type="small" themeColor="mutedForeground">
                    {[
                      EXPENSE_CATEGORY_LABELS[row.category],
                      formatBRL(Number(row.amount)),
                      formatDateBR(row.expense_date),
                      row.visibility === "shared" ? "conjunto" : "pessoal",
                      row.transaction_id ? "extrato" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </ThemedText>
                </Card>
              </Pressable>
            ))}
          </>
        ) : null}
        {tab === "pessoas" ? (
          <>
            {members.map((member) => (
              <Card key={member.id} style={styles.card}>
                <ThemedText type="smallBold">
                  {member.display_name ||
                    (member.user_id === access?.userId ? "Você" : "Membro")}
                </ThemedText>
                <ThemedText type="small" themeColor="mutedForeground">
                  {member.role === "owner" ? "Dono" : "Editor"}
                </ThemedText>
                {access?.isOwner && member.user_id !== access.userId ? (
                  <Pressable
                    onPress={() => {
                      Alert.alert(
                        "Remover membro",
                        member.display_name || "Essa pessoa",
                        [
                          { text: "Cancelar", style: "cancel" },
                          {
                            text: "Remover",
                            style: "destructive",
                            onPress: () => {
                              void removeTripMember(id, member.user_id)
                                .then(() =>
                                  setMembers((cur) =>
                                    cur.filter((row) => row.id !== member.id)
                                  )
                                )
                                .catch((err) =>
                                  fail(
                                    getErrorMessage(
                                      err,
                                      "Não foi possível remover."
                                    )
                                  )
                                );
                            },
                          },
                        ]
                      );
                    }}
                  >
                    <ThemedText themeColor="destructive">Remover</ThemedText>
                  </Pressable>
                ) : null}
              </Card>
            ))}
            {access && !access.isOwner ? (
              <Pressable
                onPress={() => {
                  Alert.alert("Sair da viagem", "Você deixa de ver esta viagem.", [
                    { text: "Cancelar", style: "cancel" },
                    {
                      text: "Sair",
                      style: "destructive",
                      onPress: () => {
                        void leaveTrip(id)
                          .then(() => router.replace("/travel"))
                          .catch((err) =>
                            fail(getErrorMessage(err, "Não foi possível sair."))
                          );
                      },
                    },
                  ]);
                }}
              >
                <ThemedText themeColor="destructive">Sair da viagem</ThemedText>
              </Pressable>
            ) : null}
          </>
        ) : null}
      </ScrollView>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.ghost,
          {
            backgroundColor: theme.background,
            borderColor: theme.primary,
          },
          ghostStyle,
        ]}
      >
        <ThemedText type="smallBold" numberOfLines={2}>
          {draggingAct?.title ?? draggingSavedPlace?.name ?? "Evento"}
        </ThemedText>
      </Animated.View>
      {trip ? (
        <OpinionShareSheet
          visible={shareOpen}
          onClose={() => setShareOpen(false)}
          title={trip.title}
          sheetTitle="Compartilhar viagem"
          hasNotes={false}
          allowPhoto
          maxPhotos={4}
          message={() => buildTripShareText(trip, tripPlaces)}
          renderCard={({ photoUris }) => (
            <TripShareStoryCard
              trip={trip}
              places={tripPlaces}
              photoUris={photoUris}
            />
          )}
        />
      ) : null}
      <ActivityAssetsSheet
        tripId={id}
        activity={assetsActivity}
        onClose={() => setAssetsActivity(null)}
        onChanged={(activityId, assets) =>
          setAssetsByActivity((cur) => ({ ...cur, [activityId]: assets }))
        }
      />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  assetButton: { flexDirection: "row", alignItems: "center", gap: 2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: { padding: Spacing.four, gap: Spacing.three },
  card: { padding: Spacing.three, gap: Spacing.two },
  summaryHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.two,
  },
  iconActions: { flexDirection: "row", gap: 8 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  metaChips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metaChip: { flexDirection: "row", alignItems: "center", gap: 6 },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  dayHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  dayCal: {
    width: 44,
    height: 44,
    borderRadius: Radius.xl,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  dayWeekday: {
    ...TypeScale.nano,
    letterSpacing: 0.6,
  },
  dayTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  expenseCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: Radius.xl,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  expenseCtaIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  weatherRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  packWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  packChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  listRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  inviteRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  activityItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: Radius.xl,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  ghost: {
    position: "absolute",
    left: 0,
    top: 0,
    zIndex: 80,
    maxWidth: 240,
    borderWidth: 1,
    borderRadius: Radius.lg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: scrim(1),
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  activityIcon: {
    width: 32,
    height: 32,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  addRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  transferBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  done: { textDecorationLine: "line-through", opacity: 0.6 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
