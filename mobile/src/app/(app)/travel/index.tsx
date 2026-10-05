import Ionicons from "@expo/vector-icons/Ionicons";
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

import { extractInviteToken } from "@/api/travel/members";
import { fetchTripsForList } from "@/api/travel/travel";
import { ChipBar } from "@/components/ChipBar";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner, Card, Input } from "@/components/ui";
import { Radius, Spacing } from "@/constants/theme";
import { getTodayIso } from "@/domain/habits";
import { TRIP_STATUS_LABELS, tripListBucket } from "@/domain/travel";
import { useAppShell } from "@/hooks/use-app-shell";
import { useModuleColors, useTheme } from "@/hooks/use-theme";
import { hexAlpha } from "@/lib/color";
import { formatBRL, formatDateBR } from "@/lib/currency";
import { getErrorMessage } from "@/lib/errors";
import type { TripWithChecklist } from "@/types/travel";

export default function TravelScreen() {
  const theme = useTheme();
  const moduleColors = useModuleColors();
  const router = useRouter();
  const { bottomInset } = useAppShell();
  const [trips, setTrips] = useState<TripWithChecklist[]>([]);
  const [filter, setFilter] = useState<"active" | "done">("active");
  const [inviteRaw, setInviteRaw] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasLoaded = useRef(false);
  const today = getTodayIso();

  const load = useCallback(async () => {
    setError(null);
    setTrips(await fetchTripsForList());
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (!hasLoaded.current) setLoading(true);
      void load()
        .catch((err) => {
          if (!cancelled) {
            setError(getErrorMessage(err, "Não foi possível carregar as viagens."));
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
    () => trips.filter((trip) => tripListBucket(trip, today) === filter),
    [filter, today, trips]
  );

  return (
    <ThemedView style={styles.flex}>
      <Banner message={error} style={styles.banner} />
      {loading && trips.length === 0 ? (
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
          <ChipBar
            options={[
              { id: "active", label: "Ativas" },
              { id: "done", label: "Concluídas" },
            ]}
            value={filter}
            onChange={setFilter}
          />
          <View
            style={[
              styles.invite,
              {
                borderColor: theme.border,
                backgroundColor: theme.muted,
              },
            ]}
          >
            <Input
              placeholder="Colar link ou token de convite"
              value={inviteRaw}
              onChangeText={setInviteRaw}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable
              onPress={() => {
                const token = extractInviteToken(inviteRaw);
                if (!token) return;
                setInviteRaw("");
                router.push({
                  pathname: "/travel/invite/[token]",
                  params: { token },
                });
              }}
            >
              <ThemedText type="linkPrimary">Entrar</ThemedText>
            </Pressable>
          </View>
          {visible.length === 0 ? (
            <ThemedText themeColor="mutedForeground">
              Nenhuma viagem neste filtro.
            </ThemedText>
          ) : (
            visible.map((trip) => {
              const ongoing = trip.status === "ongoing";
              return (
                <Pressable
                  key={trip.id}
                  onPress={() =>
                    router.push({
                      pathname: "/travel/[id]",
                      params: { id: trip.id },
                    })
                  }
                >
                  <Card
                    style={[
                      styles.card,
                      ongoing && {
                        borderColor: hexAlpha(moduleColors.travel, 0.4),
                        backgroundColor: hexAlpha(moduleColors.travel, 0.05),
                      },
                    ]}
                  >
                    <View style={styles.top}>
                      <View style={styles.copy}>
                        <View style={styles.badgeRow}>
                          <Ionicons name="airplane-outline" size={14} color={moduleColors.travel} />
                          <ThemedText type="small" themeColor="mutedForeground">
                            {TRIP_STATUS_LABELS[trip.status]}
                          </ThemedText>
                        </View>
                        <ThemedText type="smallBold">{trip.title}</ThemedText>
                        {trip.destination ? (
                          <ThemedText type="small" themeColor="mutedForeground">
                            {trip.destination}
                          </ThemedText>
                        ) : null}
                      </View>
                      {trip.daysUntilStart != null ? (
                        <View style={styles.countdown}>
                          <ThemedText type="title" style={{ color: theme.primary }}>
                            {trip.daysUntilStart}
                          </ThemedText>
                          <ThemedText type="small" themeColor="mutedForeground">
                            dias
                          </ThemedText>
                        </View>
                      ) : null}
                    </View>
                    <ThemedText type="small" themeColor="mutedForeground">
                      {formatDateBR(trip.start_date)} → {formatDateBR(trip.end_date)}
                    </ThemedText>
                    <ThemedText type="small" themeColor="mutedForeground">
                      {[
                        trip.budget != null
                          ? `Orçamento ${formatBRL(trip.budget)}`
                          : null,
                        trip.spent != null && trip.spent > 0
                          ? `Gasto ${formatBRL(trip.spent)}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </ThemedText>
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
  card: { padding: Spacing.three, gap: 8 },
  top: { flexDirection: "row", gap: 12 },
  copy: { flex: 1, gap: 4 },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  countdown: { alignItems: "flex-end" },
  invite: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: Radius.xl,
    borderWidth: 1,
    paddingHorizontal: 14,
    minHeight: 48,
  },
});
