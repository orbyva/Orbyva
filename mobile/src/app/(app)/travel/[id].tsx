import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
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

import { fetchPlaces } from "@/api/places/places";
import {
  leaveTrip,
  listTripMembers,
  removeTripMember,
} from "@/api/travel/members";
import {
  createChecklistItem,
  createItineraryActivity,
  createTripInvite,
  createTripMilestone,
  deleteChecklistItem,
  deleteItineraryActivity,
  deleteTripExpense,
  deleteTripMilestone,
  fetchTripById,
  fetchTripChecklist,
  fetchTripExpenses,
  fetchTripItinerary,
  fetchTripMilestones,
  fetchTripStops,
  listTripInvites,
  revokeTripInvite,
  toggleChecklistItem,
  tripInviteUrl,
  updateItineraryActivity,
  updateItineraryDayNotes,
  updateTripMilestone,
} from "@/api/travel/travel";
import { OpinionShareSheet } from "@/components/share/OpinionShareSheet";
import { TripShareStoryCard } from "@/components/share/TripShareStoryCard";
import { ChipBar } from "@/components/ChipBar";
import { DateField } from "@/components/DateField";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner } from "@/components/ui/Banner";
import { Card } from "@/components/ui/Card";
import { Spacing } from "@/constants/theme";
import { CLOTHING_LABELS, suggestClothingForDay, suggestPackingList } from "@/domain/travel/clothing";
import { getTodayIso } from "@/domain/habits";
import {
  CHECKLIST_CATEGORY_LABELS,
  EXPENSE_CATEGORY_LABELS,
  getTripDuration,
  MILESTONE_TYPE_LABELS,
  TRIP_STATUS_LABELS,
} from "@/domain/travel";
import { buildTripShareText } from "@/domain/share";
import { useAppShell } from "@/hooks/use-app-shell";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-toast";
import { formatBRL, formatDateBR } from "@/lib/currency";
import { getErrorMessage } from "@/lib/errors";
import { fetchTravelRoutes, type RouteLegResult } from "@/lib/googleRoutes";
import { fetchDailyForecast, type WeatherForecast } from "@/lib/googleWeather";
import { getTripAccess, type TripAccess } from "@/lib/tripAccess";
import type { PlaceVisit } from "@/types/places";
import type {
  Trip,
  TripChecklistCategory,
  TripChecklistItem,
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
  | "checklist"
  | "gastos"
  | "prazos"
  | "pessoas"
  | "convites";

const TABS: { id: Tab; label: string }[] = [
  { id: "resumo", label: "Resumo" },
  { id: "paradas", label: "Paradas" },
  { id: "roteiro", label: "Roteiro" },
  { id: "checklist", label: "Checklist" },
  { id: "gastos", label: "Gastos" },
  { id: "prazos", label: "Prazos" },
  { id: "pessoas", label: "Pessoas" },
  { id: "convites", label: "Convites" },
];

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

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
  const [checklist, setChecklist] = useState<TripChecklistItem[]>([]);
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
  const [checkTitle, setCheckTitle] = useState("");
  const [checkCategory, setCheckCategory] =
    useState<TripChecklistCategory>("packing");
  const [activityTitle, setActivityTitle] = useState("");
  const [activityDayId, setActivityDayId] = useState<string | null>(null);
  const [editingActivity, setEditingActivity] =
    useState<TripItineraryActivity | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editTime, setEditTime] = useState("");
  const [dayNoteDrafts, setDayNoteDrafts] = useState<Record<string, string>>({});
  const [milestoneTitle, setMilestoneTitle] = useState("");
  const [milestoneType, setMilestoneType] =
    useState<TripMilestoneType>("flight");
  const [milestoneDate, setMilestoneDate] = useState(getTodayIso());
  const [shareOpen, setShareOpen] = useState(false);
  const [tripPlaces, setTripPlaces] = useState<PlaceVisit[]>([]);

  const load = useCallback(async () => {
    const [
      row,
      nextStops,
      nextDays,
      nextCheck,
      nextExpenses,
      nextInvites,
      nextMembers,
      nextMilestones,
      nextAccess,
    ] = await Promise.all([
      fetchTripById(id),
      fetchTripStops(id),
      fetchTripItinerary(id).catch(() => []),
      fetchTripChecklist(id).catch(() => []),
      fetchTripExpenses(id).catch(() => []),
      listTripInvites(id).catch(() => []),
      listTripMembers(id).catch(() => []),
      fetchTripMilestones(id).catch(() => []),
      getTripAccess(id),
    ]);
    setTrip(row);
    setStops(nextStops);
    setDays(nextDays);
    setChecklist(nextCheck);
    setExpenses(nextExpenses);
    setInvites(nextInvites);
    setMembers(nextMembers);
    setMilestones(nextMilestones);
    setAccess(nextAccess);
    setDayNoteDrafts(
      Object.fromEntries(nextDays.map((day) => [day.id, day.notes ?? ""]))
    );
    navigation.setOptions({ title: row?.title ?? "Viagem" });
    if (!row) setError("Viagem não encontrada.");
    setActivityDayId((cur) => cur ?? nextDays[0]?.id ?? null);

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

  if (loading && !trip) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator color={theme.primary} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.flex}>
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: bottomInset + 24 }]}
      >
        <Banner message={error} />
        <ChipBar options={TABS} value={tab} onChange={setTab} />
        {trip && tab === "resumo" ? (
          <>
            <Card style={styles.card}>
              <ThemedText type="title">{trip.title}</ThemedText>
              <ThemedText themeColor="textSecondary">
                {[
                  trip.destination,
                  TRIP_STATUS_LABELS[trip.status],
                  `${formatDateBR(trip.start_date)} – ${formatDateBR(trip.end_date)}`,
                  `${getTripDuration(trip.start_date, trip.end_date)} dias`,
                  spent > 0 ? `Gastos ${formatBRL(spent)}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </ThemedText>
              {trip.notes ? <ThemedText>{trip.notes}</ThemedText> : null}
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: "/travel/form",
                    params: { id: trip.id },
                  })
                }
              >
                <ThemedText type="linkPrimary">Editar viagem</ThemedText>
              </Pressable>
              <Pressable onPress={() => void shareTrip()}>
                <ThemedText type="linkPrimary">Compartilhar resumo</ThemedText>
              </Pressable>
            </Card>
            {forecast?.days?.length ? (
              <Card style={styles.card}>
                <ThemedText type="smallBold">Clima e mala</ThemedText>
                {forecast.days.slice(0, 5).map((day) => {
                  const suggestion = suggestClothingForDay(day);
                  return (
                    <ThemedText
                      key={day.date ?? suggestion.summary}
                      type="small"
                      themeColor="textSecondary"
                    >
                      {day.date ? formatDateBR(day.date) : "Dia"}
                      {day.maxTemperatureC != null
                        ? ` · ${Math.round(day.maxTemperatureC)}°`
                        : ""}
                      {day.conditionText ? ` · ${day.conditionText}` : ""}
                      {suggestion.outfitPhrase
                        ? ` · ${suggestion.outfitPhrase}`
                        : ""}
                    </ThemedText>
                  );
                })}
                {packing ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    Mala:{" "}
                    {packing.items
                      .slice(0, 8)
                      .map((item) => CLOTHING_LABELS[item])
                      .join(", ")}
                  </ThemedText>
                ) : null}
              </Card>
            ) : (
              <ThemedText type="small" themeColor="textSecondary">
                Sem coordenada de destino — busque o lugar no formulário da
                viagem para ver o clima.
              </ThemedText>
            )}
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
                  ? ` · ${formatDuration(route.leg.durationSeconds)}${
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
              days.map((day) => (
                <Card key={day.id} style={styles.card}>
                  <ThemedText type="smallBold">
                    {day.title || `Dia ${day.day_number}`}
                    {day.date ? ` · ${formatDateBR(day.date)}` : ""}
                  </ThemedText>
                  {(day.activities ?? []).map((act, actIndex) => (
                    <View key={act.id} style={styles.row}>
                      <Pressable
                        style={styles.flex}
                        onPress={() => {
                          setEditingActivity(act);
                          setEditTitle(act.title);
                          setEditNotes(act.notes ?? "");
                          setEditTime(act.activity_time ?? "");
                        }}
                      >
                        <ThemedText>
                          {act.activity_time ? `${act.activity_time} · ` : ""}
                          {act.title}
                        </ThemedText>
                      </Pressable>
                      {actIndex > 0 ? (
                        <Pressable
                          onPress={() => {
                            const prev = (day.activities ?? [])[actIndex - 1];
                            void Promise.all([
                              updateItineraryActivity({
                                id: act.id,
                                sort_order: prev.sort_order,
                              }),
                              updateItineraryActivity({
                                id: prev.id,
                                sort_order: act.sort_order,
                              }),
                            ])
                              .then(() => fetchTripItinerary(id))
                              .then(setDays)
                              .catch((err) =>
                                fail(
                                  getErrorMessage(err, "Não foi possível reordenar.")
                                )
                              );
                          }}
                        >
                          <ThemedText type="small">↑</ThemedText>
                        </Pressable>
                      ) : null}
                      <Pressable
                        onPress={() => {
                          void deleteItineraryActivity(act.id)
                            .then(() =>
                              setDays((cur) =>
                                cur.map((d) =>
                                  d.id === day.id
                                    ? {
                                        ...d,
                                        activities: (d.activities ?? []).filter(
                                          (a) => a.id !== act.id
                                        ),
                                      }
                                    : d
                                )
                              )
                            )
                            .catch((err) =>
                              fail(
                                getErrorMessage(err, "Não foi possível excluir.")
                              )
                            );
                        }}
                      >
                        <ThemedText themeColor="danger">Excluir</ThemedText>
                      </Pressable>
                    </View>
                  ))}
                  <TextInput
                    placeholder="Nota do dia"
                    placeholderTextColor={theme.textSecondary}
                    style={inputStyle}
                    value={dayNoteDrafts[day.id] ?? ""}
                    onChangeText={(value) =>
                      setDayNoteDrafts((cur) => ({ ...cur, [day.id]: value }))
                    }
                  />
                  <Pressable
                    onPress={() => {
                      void updateItineraryDayNotes(
                        day.id,
                        dayNoteDrafts[day.id]?.trim() || null
                      )
                        .then(() => ok("Nota salva"))
                        .catch((err) =>
                          fail(getErrorMessage(err, "Não foi possível salvar."))
                        );
                    }}
                  >
                    <ThemedText type="linkPrimary">Salvar nota do dia</ThemedText>
                  </Pressable>
                </Card>
              ))
            )}
            {editingActivity && days.length > 0 ? (
              <Card style={styles.card}>
                <ThemedText type="smallBold">Editar atividade</ThemedText>
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
                <TextInput
                  placeholder="Notas"
                  placeholderTextColor={theme.textSecondary}
                  style={inputStyle}
                  value={editNotes}
                  onChangeText={setEditNotes}
                />
                <Pressable
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
                >
                  <ThemedText type="linkPrimary">Salvar atividade</ThemedText>
                </Pressable>
              </Card>
            ) : null}
            {days.length > 0 ? (
              <Card style={styles.card}>
                <ThemedText type="smallBold">Nova atividade</ThemedText>
                <View style={styles.chips}>
                  {days.map((day) => (
                    <Pressable
                      key={day.id}
                      onPress={() => setActivityDayId(day.id)}
                      style={[
                        styles.chip,
                        { backgroundColor: theme.backgroundElement },
                        activityDayId === day.id && {
                          backgroundColor: theme.backgroundSelected,
                        },
                      ]}
                    >
                      <ThemedText type="smallBold">
                        {day.title || `Dia ${day.day_number}`}
                      </ThemedText>
                    </Pressable>
                  ))}
                </View>
                <TextInput
                  placeholder="Passeio, voo…"
                  placeholderTextColor={theme.textSecondary}
                  style={inputStyle}
                  value={activityTitle}
                  onChangeText={setActivityTitle}
                />
                <Pressable
                  onPress={() => {
                    const dayId = activityDayId ?? days[0]?.id;
                    if (!dayId || !activityTitle.trim()) return;
                    void createItineraryActivity({
                      day_id: dayId,
                      title: activityTitle,
                    })
                      .then(() => {
                        setActivityTitle("");
                        return fetchTripItinerary(id);
                      })
                      .then(setDays)
                      .catch((err) =>
                        fail(getErrorMessage(err, "Não foi possível adicionar."))
                      );
                  }}
                >
                  <ThemedText type="linkPrimary">Adicionar ao dia</ThemedText>
                </Pressable>
              </Card>
            ) : null}
          </>
        ) : null}
        {tab === "checklist" ? (
          <>
            {checklist.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => {
                  const next = !item.done;
                  setChecklist((cur) =>
                    cur.map((row) =>
                      row.id === item.id ? { ...row, done: next } : row
                    )
                  );
                  void toggleChecklistItem(item.id, next).catch((err) => {
                    fail(getErrorMessage(err, "Não foi possível atualizar."));
                    void load();
                  });
                }}
                onLongPress={() => {
                  Alert.alert("Excluir item", item.title, [
                    { text: "Cancelar", style: "cancel" },
                    {
                      text: "Excluir",
                      style: "destructive",
                      onPress: () => {
                        void deleteChecklistItem(item.id)
                          .then(() =>
                            setChecklist((cur) =>
                              cur.filter((row) => row.id !== item.id)
                            )
                          )
                          .catch((err) =>
                            fail(getErrorMessage(err, "Não foi possível excluir."))
                          );
                      },
                    },
                  ]);
                }}
              >
                <Card style={styles.card}>
                  <ThemedText
                    type="smallBold"
                    style={item.done ? styles.done : undefined}
                  >
                    {item.done ? "✓ " : "○ "}
                    {item.title}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {CHECKLIST_CATEGORY_LABELS[item.category] ?? item.category}
                  </ThemedText>
                </Card>
              </Pressable>
            ))}
            <Card style={styles.card}>
              <TextInput
                placeholder="Novo item"
                placeholderTextColor={theme.textSecondary}
                style={inputStyle}
                value={checkTitle}
                onChangeText={setCheckTitle}
              />
              <View style={styles.chips}>
                {(Object.keys(CHECKLIST_CATEGORY_LABELS) as TripChecklistCategory[]).map(
                  (cat) => (
                    <Pressable
                      key={cat}
                      onPress={() => setCheckCategory(cat)}
                      style={[
                        styles.chip,
                        { backgroundColor: theme.backgroundElement },
                        checkCategory === cat && {
                          backgroundColor: theme.backgroundSelected,
                        },
                      ]}
                    >
                      <ThemedText type="smallBold">
                        {CHECKLIST_CATEGORY_LABELS[cat]}
                      </ThemedText>
                    </Pressable>
                  )
                )}
              </View>
              <Pressable
                onPress={() => {
                  if (!checkTitle.trim()) return;
                  void createChecklistItem({
                    trip_id: id,
                    title: checkTitle,
                    category: checkCategory,
                  })
                    .then((row) => {
                      setChecklist((cur) => [...cur, row]);
                      setCheckTitle("");
                    })
                    .catch((err) =>
                      fail(getErrorMessage(err, "Não foi possível adicionar."))
                    );
                }}
              >
                <ThemedText type="linkPrimary">Adicionar item</ThemedText>
              </Pressable>
            </Card>
          </>
        ) : null}
        {tab === "gastos" ? (
          <>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/travel/expense-form",
                  params: { tripId: id },
                })
              }
            >
              <ThemedText type="linkPrimary">Novo gasto</ThemedText>
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
        {tab === "prazos" ? (
          <>
            {milestones.map((item) => (
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
                          row.id === item.id ? { ...row, done: !row.done } : row
                        )
                      )
                    )
                    .catch((err) =>
                      fail(getErrorMessage(err, "Não foi possível atualizar."))
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
                              getErrorMessage(err, "Não foi possível excluir.")
                            )
                          );
                      },
                    },
                  ]);
                }}
              >
                <Card style={styles.card}>
                  <ThemedText
                    type="smallBold"
                    style={item.done ? styles.done : undefined}
                  >
                    {item.done ? "✓ " : "○ "}
                    {item.title}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {MILESTONE_TYPE_LABELS[item.type] ?? item.type} ·{" "}
                    {formatDateBR(item.due_date)}
                  </ThemedText>
                </Card>
              </Pressable>
            ))}
            <Card style={styles.card}>
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
                    <Pressable
                      key={type}
                      onPress={() => setMilestoneType(type)}
                      style={[
                        styles.chip,
                        { backgroundColor: theme.backgroundElement },
                        milestoneType === type && {
                          backgroundColor: theme.backgroundSelected,
                        },
                      ]}
                    >
                      <ThemedText type="smallBold">
                        {MILESTONE_TYPE_LABELS[type]}
                      </ThemedText>
                    </Pressable>
                  )
                )}
              </View>
              <Pressable
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
              >
                <ThemedText type="linkPrimary">Adicionar prazo</ThemedText>
              </Pressable>
            </Card>
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
        {tab === "convites" ? (
          <>
            <ThemedText type="small" themeColor="textSecondary">
              Quem receber o link pode abrir no app ou colar o token em Viagens.
            </ThemedText>
            {invites.map((invite) => (
              <Card key={invite.id} style={styles.card}>
                <ThemedText type="smallBold">
                  {tripInviteUrl(invite.token)}
                </ThemedText>
                <Pressable
                  onPress={() => {
                    void Share.share({
                      message: tripInviteUrl(invite.token),
                    });
                  }}
                >
                  <ThemedText type="linkPrimary">Compartilhar</ThemedText>
                </Pressable>
                <Pressable
                  onPress={() => {
                    void revokeTripInvite(invite.id)
                      .then(() =>
                        setInvites((cur) =>
                          cur.filter((row) => row.id !== invite.id)
                        )
                      )
                      .catch((err) =>
                        fail(getErrorMessage(err, "Não foi possível revogar."))
                      );
                  }}
                >
                  <ThemedText themeColor="danger">Revogar</ThemedText>
                </Pressable>
              </Card>
            ))}
            <Pressable
              onPress={() => {
                void createTripInvite(id)
                  .then((invite) => {
                    setInvites((cur) => [invite, ...cur]);
                    ok("Convite criado");
                  })
                  .catch((err) =>
                    fail(getErrorMessage(err, "Não foi possível criar o convite."))
                  );
              }}
              style={[styles.primary, { backgroundColor: theme.primary }]}
            >
              <ThemedText type="smallBold" style={styles.primaryLabel}>
                Gerar link de convite
              </ThemedText>
            </Pressable>
          </>
        ) : null}
      </ScrollView>
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
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: { padding: Spacing.four, gap: Spacing.three },
  card: { padding: Spacing.three, gap: Spacing.two },
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
