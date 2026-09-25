import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet } from "react-native";

import { acceptTripInvite, fetchInviteByToken } from "@/api/travel/members";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner } from "@/components/ui/Banner";
import { Card } from "@/components/ui/Card";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import type { TripInvite } from "@/types/travel";

export default function TripInviteScreen() {
  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const { fail, ok } = useFeedback();
  const params = useLocalSearchParams<{ token?: string }>();
  const token = typeof params.token === "string" ? params.token : "";
  const [invite, setInvite] = useState<
    (TripInvite & { trip_title?: string }) | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: "Convite" });
  }, [navigation]);

  useEffect(() => {
    let cancelled = false;
    void fetchInviteByToken(token)
      .then((row) => {
        if (cancelled) return;
        setInvite(row);
        if (!row) setError("Convite inválido ou expirado.");
      })
      .catch((err) => {
        if (!cancelled) {
          setError(getErrorMessage(err, "Não foi possível abrir o convite."));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function onAccept() {
    setAccepting(true);
    try {
      const tripId = await acceptTripInvite(token);
      ok("Você entrou na viagem");
      router.replace({ pathname: "/travel/[id]", params: { id: tripId } });
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível aceitar o convite."));
    } finally {
      setAccepting(false);
    }
  }

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator color={theme.primary} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.body}>
      <Banner message={error} />
      <Card style={styles.card}>
        <ThemedText type="title">
          {invite?.trip_title ?? "Convite de viagem"}
        </ThemedText>
        <ThemedText themeColor="textSecondary">
          Aceite para ver o roteiro, os gastos conjuntos e os prazos.
        </ThemedText>
        <Pressable
          disabled={accepting || !invite}
          onPress={() => void onAccept()}
          style={[styles.primary, { backgroundColor: theme.primary }]}
        >
          {accepting ? (
            <ActivityIndicator color="#0B0F1A" />
          ) : (
            <ThemedText type="smallBold" style={styles.primaryLabel}>
              Aceitar convite
            </ThemedText>
          )}
        </Pressable>
        <Pressable onPress={() => router.replace("/travel")}>
          <ThemedText type="linkPrimary">Voltar para viagens</ThemedText>
        </Pressable>
      </Card>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, padding: Spacing.four, gap: Spacing.three },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: { padding: Spacing.three, gap: Spacing.two },
  primary: {
    height: 48,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.two,
  },
  primaryLabel: { color: "#0B0F1A" },
});
