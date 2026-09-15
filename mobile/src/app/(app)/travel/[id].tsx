import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";

import { fetchPlaces } from "@/api/places/places";
import {
  leaveTrip,
  listTripMembers,
  removeTripMember,
} from "@/api/travel/members";
import {
  createTripInvite,
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
import { TripShareStoryCard } from "@/components/share/TripShareStoryCard";
import { ChipBar } from "@/components/ChipBar";
import { ChoiceChip } from "@/components/ChoiceChip";
import { DateField } from "@/components/DateField";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { TripItineraryComposer } from "@/components/travel/TripItineraryComposer";
import { VisitDragHandle } from "@/components/travel/VisitDragHandle";
import { TypeIcon } from "@/components/TypeIcon";
import { Banner } from "@/components/ui/Banner";
import { Card } from "@/components/ui/Card";
import { FormButton } from "@/components/ui/FormButton";
import { Spacing } from "@/constants/theme";
import {
  CLOTHING_LABELS,
  CLOTHING_META,
  suggestClothingForDay,
  suggestPackingList,
  type ClothingIconKey,
} from "@/domain/travel/clothing";
import { getTodayIso } from "@/domain/habits";
import { PLACE_TYPE_META } from "@/domain/places";
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
import { useAppShell } from "@/hooks/use-app-shell";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-toast";
import { hexAlpha } from "@/lib/color";
import { dragListLayout, useDropLanding } from "@/lib/dragMotion";
import { formatBRL, formatDateBR } from "@/lib/currency";
import { getErrorMessage } from "@/lib/errors";
import { fetchTravelRoutes, type RouteLegResult } from "@/lib/googleRoutes";
import { fetchDailyForecast, type WeatherForecast } from "@/lib/googleWeather";
import { getTripAccess, type TripAccess } from "@/lib/tripAccess";
import type { PlaceType, PlaceVisit } from "@/types/places";
import type {
  Trip,
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

const CLOTHING_IONICONS: Record<
  ClothingIconKey,
  keyof typeof Ionicons.glyphMap
> = {
  tank: "body-outline",
  shirt: "shirt-outline",
  "long-sleeve": "shirt",
  jacket: "cloudy-night-outline",
  coat: "snow-outline",
  raincoat: "rainy-outline",
  pants: "walk-outline",
  "warm-pants": "snow-outline",
  shorts: "sunny-outline",
  shoe: "footsteps-outline",
  umbrella: "umbrella-outline",
};

function weatherIcon(
  text?: string | null
): keyof typeof Ionicons.glyphMap {
  const raw = (text ?? "").toLowerCase();
  if (/chuva|rain|tempest|storm|thunder/.test(raw)) return "rainy-outline";
  if (/neve|snow/.test(raw)) return "snow-outline";
  if (/nublado|cloud|overcast/.test(raw)) return "cloudy-outline";
  if (/sol|sunny|clear|céu limpo/.test(raw)) return "sunny-outline";
  return "partly-sunny-outline";
}

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

const SKY = "#0EA5E9";

export default function TripDetailScreen() {
  const theme = useTheme();
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
  const [forecast, setForecast] = useState<WeatherForecast | null>(null);
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
    setTrip(row);
    setStops(nextStops);
    setDays(nextDays);
    setExpenses(nextExpenses);
    setInvites(nextInvites);
    setMembers(nextMembers);
    setMilestones(nextMilestones);
    setAccess(nextAccess);
    setTripPlaces(nextPlaces.filter((place) => place.trip_id === id));
    navigation.setOptions({ title: row?.title ?? "Viagem" });
    if (!row) setError("Viagem não encontrada.");

    const weatherPoint =
      row?.destination_lat != null && row.destination_lng != null
        ? { lat: row.destination_lat, lng: row.destination_lng }
        : nextStops.find((s) => s.lat != null && s.lng != null);
    if (weatherPoint?.lat != null && weatherPoint.lng != null) {
      void fetchDailyForecast({
        lat: weatherPoint.lat,
        lng: weatherPoint.lng,
      })
        .then(setForecast)
        .catch(() => setForecast(null));
    } else {
      setForecast(null);
    }

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
  const packing = useMemo(
    () => (forecast?.days?.length ? suggestPackingList(forecast.days) : null),
    [forecast]
  );

  const inputStyle = [
    styles.input,
    {
      color: theme.text,
      borderColor: theme.backgroundSelected,
      backgroundColor: theme.backgroundElement,
    },
  ];

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
      fail(getErrorMessage(err, "Não foi possível atualizar a visita."));
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
        "Visitas com horário mudam de dia, mas a ordem no dia segue o relógio."
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
      fail(getErrorMessage(err, "Não foi possível mover a visita."));
      void fetchTripItinerary(id).then(setDays);
    });
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
                        color={theme.textSecondary}
                      />
                      <ThemedText type="small" themeColor="textSecondary">
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
                      name="pencil-outline"
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
                        { backgroundColor: hexAlpha(theme.danger, 0.12) },
                      ]}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={18}
                        color={theme.danger}
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
                    color={theme.textSecondary}
                  />
                  <ThemedText type="small">
                    {TRIP_STATUS_LABELS[trip.status]}
                  </ThemedText>
                </View>
                <View style={styles.metaChip}>
                  <Ionicons
                    name="calendar-outline"
                    size={14}
                    color={theme.textSecondary}
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
                    color={theme.textSecondary}
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
                      color={theme.textSecondary}
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
              {forecast?.days?.length ? (
                <>
                  {forecast.days.slice(0, 5).map((day) => {
                    const suggestion = suggestClothingForDay(day);
                    return (
                      <View
                        key={day.date ?? suggestion.summary}
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
                            {day.maxTemperatureC != null
                              ? ` · ${Math.round(day.maxTemperatureC)}°`
                              : ""}
                          </ThemedText>
                          <ThemedText type="small" themeColor="textSecondary">
                            {[day.conditionText, suggestion.outfitPhrase]
                              .filter(Boolean)
                              .join(" · ")}
                          </ThemedText>
                        </View>
                      </View>
                    );
                  })}
                  {packing ? (
                    <View style={styles.packWrap}>
                      {packing.items.slice(0, 8).map((item) => {
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
              ) : (
                <ThemedText type="small" themeColor="textSecondary">
                  Adicione paradas com cidade no mapa para ver o clima.
                </ThemedText>
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
              <ThemedText type="small" themeColor="textSecondary">
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
                      color={theme.danger}
                    />
                  </Pressable>
                </View>
              ))}
              <FormButton
                label="Gerar link de convite"
                tone="primary"
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
              />
            </Card>
            {access?.isOwner ? (
              <FormButton
                label="Excluir viagem"
                tone="danger"
                onPress={confirmDeleteTrip}
              />
            ) : null}
          </>
        ) : null}
        {tab === "paradas" ? (
          <>
            {stops.length === 0 ? (
              <ThemedText themeColor="textSecondary">
                Nenhuma parada. Edite a viagem para adicionar cidades.
              </ThemedText>
            ) : (
              stops.map((stop) => (
                <Card key={stop.id} style={styles.card}>
                  <ThemedText type="smallBold">{stop.name}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {formatDateBR(stop.start_date)} – {formatDateBR(stop.end_date)}
                  </ThemedText>
                </Card>
              ))
            )}
            {routes.map((route) => (
              <ThemedText
                key={`${route.from}-${route.to}`}
                type="small"
                themeColor="textSecondary"
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
              <ThemedText themeColor="textSecondary">
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
                            : theme.backgroundElement,
                        },
                      ]}
                    >
                      <ThemedText
                        type="small"
                        themeColor={isToday ? "primary" : "textSecondary"}
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
                            themeColor="textSecondary"
                          >
                            {offsetLabel}
                          </ThemedText>
                        ) : null}
                      </View>
                      <ThemedText type="small" themeColor="textSecondary">
                        {dateLabel ?? `Dia ${day.day_number}`}
                        {dayTitle ? ` · Dia ${day.day_number}` : ""}
                      </ThemedText>
                    </View>
                  </View>
                  {(day.activities ?? []).length === 0 ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      Nenhuma visita neste dia.
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
                                borderColor: hexAlpha(SKY, 0.25),
                                backgroundColor: hexAlpha(SKY, 0.04),
                              }
                            : null,
                          !transfer && status === "pending"
                            ? {
                                borderColor: hexAlpha(theme.text, 0.08),
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
                                borderColor: theme.backgroundSelected,
                                backgroundColor: hexAlpha(theme.text, 0.04),
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
                                borderRadius: 8,
                                borderWidth: 1,
                                borderColor: hexAlpha(SKY, 0.3),
                                backgroundColor: hexAlpha(SKY, 0.1),
                              },
                            ]}
                          >
                            <TypeIcon
                              name={activityIconName(act)}
                              color={SKY}
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
                                borderRadius: 8,
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
                                color="#FFFFFF"
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
                                color: SKY,
                                fontWeight: "700",
                                letterSpacing: 0.4,
                                textTransform: "uppercase",
                                fontSize: 10,
                              }}
                            >
                              Deslocamento
                              {modeLabel ? ` · ${modeLabel}` : ""}
                            </ThemedText>
                          ) : null}
                          {timeLabel ? (
                            <ThemedText type="small" themeColor="textSecondary">
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
                            <ThemedText type="small" themeColor="textSecondary">
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
                              themeColor="textSecondary"
                            >
                              {act.notes.trim()}
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
                                : "Excluir esta visita?",
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
                            color={theme.danger}
                          />
                        </Pressable>
                      </Animated.View>
                    );
                  })}
                  <View style={styles.addRow}>
                    <FormButton
                      label="Adicionar visita"
                      flex
                      onPress={() =>
                        setAddingFor({ dayId: day.id, kind: "visit" })
                      }
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
                    name="pencil-outline"
                    size={18}
                    color={theme.primary}
                  />
                  <ThemedText type="smallBold">Editar item</ThemedText>
                </View>
                <TextInput
                  style={inputStyle}
                  value={editTitle}
                  onChangeText={setEditTitle}
                />
                <TextInput
                  placeholder="Horário (ex. 09:30)"
                  placeholderTextColor={theme.textSecondary}
                  style={inputStyle}
                  value={editTime}
                  onChangeText={setEditTime}
                />
                {isTransportActivity(editingActivity) ? null : (
                  <TextInput
                    placeholder="Observação da visita — opcional"
                    placeholderTextColor={theme.textSecondary}
                    style={inputStyle}
                    value={editNotes}
                    onChangeText={setEditNotes}
                  />
                )}
                {editingActivity.place_visit_id ? (
                  <FormButton
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
                  />
                ) : null}
                <FormButton
                  label="Salvar"
                  tone="primary"
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
                />
                <FormButton
                  label="Cancelar"
                  onPress={() => setEditingActivity(null)}
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
              <ThemedText type="small" themeColor="textSecondary">
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
                    color={item.done ? theme.primary : theme.textSecondary}
                  />
                  <View style={styles.flex}>
                    <ThemedText
                      type="smallBold"
                      style={item.done ? styles.done : undefined}
                    >
                      {item.title}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {MILESTONE_TYPE_LABELS[item.type] ?? item.type} ·{" "}
                      {formatDateBR(item.due_date)}
                    </ThemedText>
                  </View>
                </Pressable>
              ))
            )}
            <TextInput
              placeholder="Título do prazo"
              placeholderTextColor={theme.textSecondary}
              style={inputStyle}
              value={milestoneTitle}
              onChangeText={setMilestoneTitle}
            />
            <DateField
              value={milestoneDate}
              onChange={setMilestoneDate}
              style={inputStyle}
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
            <FormButton
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
                <ThemedText type="small" themeColor="textSecondary">
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
                  <ThemedText type="small" themeColor="textSecondary">
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
                <ThemedText type="small" themeColor="textSecondary">
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
                    <ThemedText themeColor="danger">Remover</ThemedText>
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
                <ThemedText themeColor="danger">Sair da viagem</ThemedText>
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
          {draggingAct?.title ?? "Visita"}
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
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
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
    borderRadius: 18,
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
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  dayWeekday: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.6,
    lineHeight: 11,
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
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  expenseCtaIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  weatherRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  packWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  packChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  listRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  inviteRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  activityItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 12,
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
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: "#0B0F1A",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  activityIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  addRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  transferBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  row: { flexDirection: "row", alignItems: "center", gap: Spacing.two },
  done: { textDecorationLine: "line-through", opacity: 0.6 },
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
  },
  primaryLabel: { color: "#0B0F1A" },
});
