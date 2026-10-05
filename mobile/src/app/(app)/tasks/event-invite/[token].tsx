import Ionicons from "@expo/vector-icons/Ionicons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { acceptEventInvite, getEventInviteByToken } from "@/api/tasks/eventInvites";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Button, Card } from "@/components/ui";
import { Spacing } from "@/constants/theme";
import {
  eventInviteState,
  parseEventInviteToken,
  type EventInviteState,
} from "@/domain/tasks/eventInvites";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-toast";
import { formatEventWhen } from "@/lib/dates";
import { getErrorMessage } from "@/lib/errors";

type ScreenState = { kind: "loading" } | EventInviteState;

export default function EventInviteAcceptScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const { ok, fail } = useFeedback();
  const params = useLocalSearchParams<{ token?: string }>();
  const token = parseEventInviteToken(typeof params.token === "string" ? params.token : "");
  const [state, setState] = useState<ScreenState>({ kind: "loading" });
  const [accepting, setAccepting] = useState(false);

  const load = useCallback(async () => {
    if (!token) {
      setState({
        kind: "error",
        title: "Convite não encontrado",
        description: "O link do convite está incompleto.",
      });
      return;
    }
    setState({ kind: "loading" });
    try {
      setState(eventInviteState(await getEventInviteByToken(token), user?.email));
    } catch (err) {
      setState({
        kind: "error",
        title: "Não foi possível abrir o convite",
        description: getErrorMessage(err, "Tente de novo em alguns instantes."),
      });
    }
  }, [token, user?.email]);

  useEffect(() => {
    void load();
  }, [load]);

  async function accept() {
    if (!token) return;
    setAccepting(true);
    try {
      await acceptEventInvite(token);
      ok("Evento adicionado à sua agenda");
      router.replace("/tasks/agenda");
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível aceitar o convite."));
      void load();
    } finally {
      setAccepting(false);
    }
  }

  const goAgenda = () => router.replace("/tasks/agenda");

  return (
    <ThemedView style={styles.body}>
      <Card style={styles.card}>
        {state.kind === "loading" ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.primary} />
            <ThemedText type="small" themeColor="mutedForeground">
              Verificando convite…
            </ThemedText>
          </View>
        ) : state.kind === "error" ? (
          <>
            <ThemedText type="subtitle">{state.title}</ThemedText>
            <ThemedText themeColor="mutedForeground">{state.description}</ThemedText>
            <Button
              label="Ir para a agenda"
              onPress={goAgenda}
              variant="outline"
            />
          </>
        ) : state.kind === "other-email" ? (
          <>
            <ThemedText type="subtitle">Convite para outra conta</ThemedText>
            <ThemedText themeColor="mutedForeground">
              Este convite foi enviado para {state.invite.email}, e você está logado como{" "}
              {user?.email ?? "outra conta"}. Entre com a conta convidada para aceitar.
            </ThemedText>
            <Button
              label="Ir para a agenda"
              onPress={goAgenda}
              variant="outline"
            />
          </>
        ) : state.kind === "accepted-by-me" ? (
          <>
            <ThemedText type="subtitle">Você já aceitou este convite</ThemedText>
            <ThemedText themeColor="mutedForeground">
              {state.invite.event_title ?? "O evento"} já está na sua agenda.
            </ThemedText>
            <Button
              label="Ver na agenda"
              onPress={goAgenda}
              size="lg"
            />
          </>
        ) : (
          <>
            <ThemedText type="small" themeColor="mutedForeground">
              CONVITE DE EVENTO
            </ThemedText>
            <ThemedText type="subtitle">{state.invite.event_title ?? "Evento"}</ThemedText>
            {state.invite.event_starts_at ? (
              <View style={styles.when}>
                <Ionicons name="calendar-outline" size={16} color={theme.mutedForeground} />
                <ThemedText themeColor="mutedForeground">
                  {formatEventWhen(state.invite.event_starts_at)}
                  {state.invite.event_ends_at
                    ? ` — ${formatEventWhen(state.invite.event_ends_at).slice(-5)}`
                    : ""}
                </ThemedText>
              </View>
            ) : null}
            <ThemedText type="small" themeColor="mutedForeground">
              Aceitar cria uma cópia deste evento na sua agenda. Ninguém passa a ver o resto da sua
              conta.
            </ThemedText>
            <Button
              label={accepting ? "Adicionando…" : "Aceitar convite"}
              loading={accepting}
              onPress={() => void accept()}
              size="lg"
            />
          </>
        )}
      </Card>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, padding: Spacing.four },
  card: { gap: 12, padding: Spacing.four },
  center: { alignItems: "center", gap: 8, paddingVertical: Spacing.four },
  when: { flexDirection: "row", alignItems: "center", gap: 6 },
});
