import Ionicons from "@expo/vector-icons/Ionicons";
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  View,
} from "react-native";

import {
  createEventInvite,
  listEventInvites,
  resendEventInvite,
  revokeEventInvite,
} from "@/api/tasks/eventInvites";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Button, Card, Input } from "@/components/ui";
import { Radius, Spacing } from "@/constants/theme";
import {
  EVENT_INVITE_STATUS_LABEL,
  eventInviteUrl,
  validateInviteEmail,
} from "@/domain/tasks/eventInvites";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import type { EventInvite } from "@/types/tasks";

/** Convidar alguém para um evento: e-mail (best-effort) ou link, reenviar e cancelar. */
export default function EventInvitesScreen() {
  const theme = useTheme();
  const navigation = useNavigation();
  const { ok, fail } = useFeedback();
  const params = useLocalSearchParams<{ eventId?: string; title?: string }>();
  const eventId = typeof params.eventId === "string" ? params.eventId : "";
  const eventTitle = typeof params.title === "string" ? params.title : "";
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [invites, setInvites] = useState<EventInvite[]>([]);
  const [fallbackLink, setFallbackLink] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: `Convidar para ${eventTitle.trim() || "o evento"}` });
  }, [navigation, eventTitle]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setInvites(await listEventInvites(eventId));
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível carregar os convites."));
    } finally {
      setLoading(false);
    }
  }, [eventId, fail]);

  useEffect(() => {
    void load();
  }, [load]);

  async function copy(url: string, title = "Link copiado") {
    await Clipboard.setStringAsync(url);
    ok(title);
  }

  async function send() {
    const problem = validateInviteEmail(email);
    if (problem) {
      setEmailError(problem);
      return;
    }
    setSending(true);
    setEmailError(null);
    try {
      const { invite, emailSent, resent } = await createEventInvite(eventId, email);
      if (emailSent) {
        setFallbackLink(null);
        ok(`${resent ? "Convite reenviado" : "Convite enviado"} para ${invite.email}`);
      } else {
        setFallbackLink(eventInviteUrl(invite.token));
        fail("Convite criado, mas o e-mail não saiu. Copie o link e mande por onde preferir.");
      }
      setEmail("");
      await load();
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível convidar."));
    } finally {
      setSending(false);
    }
  }

  async function linkOnly() {
    setSending(true);
    try {
      const { invite } = await createEventInvite(eventId);
      const url = eventInviteUrl(invite.token);
      setFallbackLink(url);
      await copy(url, "Link do convite copiado");
      await load();
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível gerar o link."));
    } finally {
      setSending(false);
    }
  }

  async function resend(invite: EventInvite) {
    const sent = await resendEventInvite(invite.id);
    if (sent) ok(`Convite reenviado para ${invite.email}`);
    else fail("O e-mail não saiu. Copie o link e mande por onde preferir.");
    await load();
  }

  async function revoke(invite: EventInvite) {
    try {
      await revokeEventInvite(invite.id);
      ok("Convite cancelado");
      await load();
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível cancelar."));
    }
  }

  if (!eventId) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText themeColor="mutedForeground">Evento não encontrado.</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Card style={styles.card}>
          <ThemedText type="small" themeColor="mutedForeground">
            E-mail de quem você quer convidar
          </ThemedText>
          <Input
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="nome@dominio.com"
            value={email}
            onChangeText={(value) => {
              setEmail(value);
              if (emailError) setEmailError(null);
            }}
            onBlur={() => {
              if (email.trim()) setEmailError(validateInviteEmail(email));
            }}
          />
          {emailError ? (
            <ThemedText type="small" style={{ color: theme.destructive }}>
              {emailError}
            </ThemedText>
          ) : (
            <ThemedText type="small" themeColor="mutedForeground">
              Ela recebe um link para aceitar e o evento vai para a agenda dela. O anexo do e-mail
              já adiciona no Google, Apple ou Outlook Calendar.
            </ThemedText>
          )}
          <View style={styles.row}>
            <Button
              label={sending ? "Enviando…" : "Enviar convite"}
              loading={sending}
              onPress={() => void send()}
              size="lg"
              style={{ flex: 1 }}
            />
            <Button
              label="Copiar link"
              disabled={sending}
              onPress={() => void linkOnly()}
              variant="outline"
              style={{ flex: 1 }}
            />
          </View>
          {fallbackLink ? (
            <View style={[styles.fallback, { borderColor: theme.border }]}>
              <ThemedText type="smallBold">Link do convite</ThemedText>
              <ThemedText type="small" themeColor="mutedForeground" selectable>
                {fallbackLink}
              </ThemedText>
              <View style={styles.row}>
                <Button
                  label="Copiar"
                  onPress={() => void copy(fallbackLink)}
                  variant="outline"
                  size="sm"
                  style={{ flex: 1 }}
                />
                <Button
                  label="Compartilhar"
                  onPress={() => void Share.share({ message: fallbackLink })}
                  variant="outline"
                  size="sm"
                  style={{ flex: 1 }}
                />
              </View>
            </View>
          ) : null}
        </Card>

        <ThemedText type="smallBold">Convites deste evento</ThemedText>
        {loading ? (
          <ActivityIndicator color={theme.primary} />
        ) : invites.length === 0 ? (
          <ThemedText type="small" themeColor="mutedForeground">
            Ninguém foi convidado ainda.
          </ThemedText>
        ) : (
          <Card style={styles.list}>
            {invites.map((invite, index) => {
              const who = invite.email ?? "Convite por link";
              const pending = invite.status === "pending";
              return (
                <View
                  key={invite.id}
                  style={[
                    styles.inviteRow,
                    index > 0 && {
                      borderTopWidth: StyleSheet.hairlineWidth,
                      borderTopColor: theme.border,
                    },
                  ]}
                >
                  <View style={styles.flex}>
                    <ThemedText type="smallBold" numberOfLines={1}>
                      {who}
                    </ThemedText>
                    <ThemedText type="small" themeColor="mutedForeground">
                      {EVENT_INVITE_STATUS_LABEL[invite.status] ?? invite.status}
                    </ThemedText>
                  </View>
                  <IconButton
                    icon="copy-outline"
                    label={`Copiar link do convite de ${who}`}
                    onPress={() => void copy(eventInviteUrl(invite.token))}
                  />
                  <IconButton
                    icon="share-outline"
                    label={`Compartilhar convite de ${who}`}
                    onPress={() => void Share.share({ message: eventInviteUrl(invite.token) })}
                  />
                  {pending && invite.email ? (
                    <IconButton
                      icon="send-outline"
                      label={`Reenviar convite de ${who}`}
                      onPress={() => void resend(invite)}
                    />
                  ) : null}
                  {pending ? (
                    <IconButton
                      icon="trash-outline"
                      label={`Cancelar convite de ${who}`}
                      color={theme.destructive}
                      onPress={() => void revoke(invite)}
                    />
                  ) : null}
                </View>
              );
            })}
          </Card>
        )}
      </ScrollView>
    </ThemedView>
  );
}

function IconButton({
  icon,
  label,
  onPress,
  color,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  color?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      onPress={onPress}
      style={styles.iconBtn}
    >
      <Ionicons name={icon} size={18} color={color ?? theme.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: { padding: Spacing.four, gap: Spacing.three, paddingBottom: 48 },
  card: { gap: 10, padding: Spacing.three },
  list: { padding: 0 },
  row: { flexDirection: "row", gap: 10 },
  fallback: { gap: 6, borderWidth: 1, borderStyle: "dashed", borderRadius: Radius.lg, padding: 10 },
  inviteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: Spacing.three,
    paddingVertical: 12,
  },
  iconBtn: { padding: 4 },
});
