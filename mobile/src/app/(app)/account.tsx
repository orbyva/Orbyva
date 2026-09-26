import Ionicons from "@expo/vector-icons/Ionicons";
import * as WebBrowser from "expo-web-browser";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from "react-native";

import { deleteOwnAccount, wipeOwnData } from "@/api/account";
import {
  exportFinanceCsv,
  exportGoalsCsv,
  exportHabitsCsv,
  exportMoviesCsv,
  exportPlacesCsv,
  exportTripsCsv,
  exportVehiclesCsv,
} from "@/api/export";
import { countReferrals, ensureReferralCode, inviteUrlForCode } from "@/api/referral";
import { ModuleGuideSheet } from "@/components/ModuleGuideSheet";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner } from "@/components/ui/Banner";
import { Card } from "@/components/ui/Card";
import { Spacing } from "@/constants/theme";
import { useAppShell } from "@/hooks/use-app-shell";
import { useAuth } from "@/hooks/use-auth";
import { usePlan } from "@/hooks/use-plan";
import { useTheme } from "@/hooks/use-theme";
import { useThemePreference } from "@/hooks/use-theme-preference";
import { useFeedback } from "@/hooks/use-toast";
import { ALERT_KIND_OPTIONS, loadEnabledAlertKinds, setAlertKindEnabled } from "@/lib/alertPrefs";
import { getErrorMessage } from "@/lib/errors";
import type { ModuleGuideId } from "@/lib/moduleGuides";
import { MODULE_GUIDES } from "@/lib/moduleGuides";
import { resetOnboarding } from "@/lib/onboarding";
import { PLANS } from "@/lib/plan";
import { AUTH_STORAGE_KEY } from "@/lib/supabase";
import { secureStoreAdapter } from "@/lib/secure-store";
import type { AppAlertKind } from "@/domain/alerts";

const SITE = "https://orbyva.app";

export default function AccountScreen() {
  const { user, signOut } = useAuth();
  const theme = useTheme();
  const { fail, ok } = useFeedback();
  const { scheme, toggleScheme } = useThemePreference();
  const plan = usePlan();
  const { bottomInset } = useAppShell();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enabledKinds, setEnabledKinds] = useState<Set<AppAlertKind>>(new Set());
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteCount, setInviteCount] = useState(0);
  const [wipeText, setWipeText] = useState("");
  const [deleteText, setDeleteText] = useState("");
  const [guideId, setGuideId] = useState<ModuleGuideId | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  const name =
    (user?.user_metadata?.full_name as string | undefined) ||
    (user?.user_metadata?.name as string | undefined) ||
    "Usuário";
  const avatar =
    (user?.user_metadata?.avatar_url as string | undefined) ||
    (user?.user_metadata?.picture as string | undefined) ||
    "";
  const initial = name.trim().slice(0, 1).toUpperCase() || "?";

  const planMeta = plan.isPro ? PLANS.pro : PLANS.free;
  const accessLabel = plan.hasAccess
    ? plan.isPro
      ? "Pro"
      : `Teste · ${plan.trialDaysLeft} dia${plan.trialDaysLeft === 1 ? "" : "s"}`
    : plan.accessBlockReason === "payment_failed"
      ? "Pagamento pendente"
      : plan.accessBlockReason === "canceled"
        ? "Assinatura encerrada"
        : "Teste encerrado";

  useEffect(() => {
    void loadEnabledAlertKinds().then(setEnabledKinds);
    void Promise.all([ensureReferralCode(), countReferrals()])
      .then(([code, n]) => {
        setInviteUrl(inviteUrlForCode(code));
        setInviteCount(n);
      })
      .catch(() => undefined);
  }, []);

  async function handleSignOut() {
    setBusy(true);
    setError(null);
    try {
      await signOut();
      await secureStoreAdapter.removeItem(AUTH_STORAGE_KEY);
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível sair."));
    } finally {
      setBusy(false);
    }
  }

  async function toggleKind(kind: AppAlertKind, value: boolean) {
    setEnabledKinds(await setAlertKindEnabled(kind, value));
  }

  async function runExport(key: string, fn: () => Promise<void>) {
    setExporting(key);
    try {
      await fn();
      ok("Arquivo pronto para compartilhar");
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível exportar."));
    } finally {
      setExporting(null);
    }
  }

  async function handleWipe() {
    if (wipeText.trim().toUpperCase() !== "LIMPAR") return;
    setBusy(true);
    try {
      await wipeOwnData();
      setWipeText("");
      ok("Dados apagados. A conta continua ativa.");
    } catch (err) {
      fail(getErrorMessage(err, "Não foi possível limpar os dados."));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (deleteText.trim().toUpperCase() !== "EXCLUIR") return;
    Alert.alert("Excluir conta", "Isso apaga a conta e os dados. Não tem volta.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: () => {
          void (async () => {
            setBusy(true);
            try {
              await deleteOwnAccount();
              await secureStoreAdapter.removeItem(AUTH_STORAGE_KEY);
            } catch (err) {
              fail(getErrorMessage(err, "Não foi possível excluir a conta."));
              setBusy(false);
            }
          })();
        },
      },
    ]);
  }

  return (
    <ThemedView style={styles.flex}>
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: bottomInset + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <ThemedText type="title">Conta</ThemedText>

        <Card style={styles.block}>
          <View style={styles.profile}>
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, { backgroundColor: theme.backgroundSelected }]}>
                <ThemedText type="smallBold">{initial}</ThemedText>
              </View>
            )}
            <View style={styles.profileText}>
              <ThemedText type="smallBold">{name}</ThemedText>
              <ThemedText themeColor="textSecondary">{user?.email ?? "sem e-mail"}</ThemedText>
            </View>
          </View>
        </Card>

        <Card style={styles.block}>
          <ThemedText type="small" themeColor="textSecondary">
            Plano
          </ThemedText>
          {plan.loading ? (
            <ActivityIndicator color={theme.primary} />
          ) : (
            <>
              <ThemedText type="smallBold">{planMeta.name}</ThemedText>
              <ThemedText themeColor="textSecondary">{accessLabel}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Assinatura e upgrade continuam no web.
              </ThemedText>
              <Pressable
                onPress={() => void WebBrowser.openBrowserAsync(`${SITE}/account`)}
                style={[styles.btn, { borderColor: theme.backgroundSelected }]}
              >
                <ThemedText type="smallBold">Gerenciar em orbyva.app</ThemedText>
              </Pressable>
            </>
          )}
        </Card>

        <Card style={styles.block}>
          <ThemedText type="smallBold">Aparência</ThemedText>
          <Pressable
            onPress={toggleScheme}
            style={[styles.btn, { borderColor: theme.backgroundSelected }]}
          >
            <Ionicons
              name={scheme === "dark" ? "sunny-outline" : "moon-outline"}
              size={18}
              color={theme.text}
            />
            <ThemedText type="smallBold">
              Alternar para {scheme === "dark" ? "Claro" : "Escuro"}
            </ThemedText>
          </Pressable>
        </Card>

        <Card style={styles.block}>
          <ThemedText type="smallBold">Alertas no sino</ThemedText>
          {ALERT_KIND_OPTIONS.map((option) => (
            <View key={option.kind} style={styles.prefRow}>
              <View style={styles.prefText}>
                <ThemedText type="smallBold">{option.label}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {option.description}
                </ThemedText>
              </View>
              <Switch
                value={enabledKinds.has(option.kind)}
                onValueChange={(value) => void toggleKind(option.kind, value)}
              />
            </View>
          ))}
        </Card>

        <Card style={styles.block}>
          <ThemedText type="smallBold">Convide amigos</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {inviteCount} convite{inviteCount === 1 ? "" : "s"} aceito{inviteCount === 1 ? "" : "s"}
          </ThemedText>
          <Pressable
            disabled={!inviteUrl}
            onPress={() => {
              if (!inviteUrl) return;
              void Share.share({ message: inviteUrl });
            }}
            style={[styles.btn, { borderColor: theme.backgroundSelected }]}
          >
            <ThemedText type="smallBold">Compartilhar link</ThemedText>
          </Pressable>
        </Card>

        <Card style={styles.block}>
          <ThemedText type="smallBold">Como funciona</ThemedText>
          {(Object.keys(MODULE_GUIDES) as ModuleGuideId[]).map((id) => (
            <Pressable key={id} onPress={() => setGuideId(id)} style={styles.linkRow}>
              <ThemedText>{MODULE_GUIDES[id].title}</ThemedText>
            </Pressable>
          ))}
          {user?.id ? (
            <Pressable
              onPress={() => {
                void resetOnboarding(user.id).then(() => ok("Tour resetado. Volte ao Início."));
              }}
              style={styles.linkRow}
            >
              <ThemedText type="linkPrimary">Refazer tour</ThemedText>
            </Pressable>
          ) : null}
        </Card>

        <Card style={styles.block}>
          <ThemedText type="smallBold">Exportar CSV</ThemedText>
          {(
            [
              ["finance", "Finanças", exportFinanceCsv],
              ["goals", "Metas", exportGoalsCsv],
              ["habits", "Hábitos", exportHabitsCsv],
              ["movies", "Cinema", exportMoviesCsv],
              ["places", "Lugares", exportPlacesCsv],
              ["trips", "Viagens", exportTripsCsv],
              ["vehicles", "Veículos", exportVehiclesCsv],
            ] as const
          ).map(([key, label, fn]) => (
            <Pressable
              key={key}
              disabled={exporting != null}
              onPress={() => void runExport(key, fn)}
              style={styles.linkRow}
            >
              <ThemedText>
                {exporting === key ? "Gerando…" : label}
              </ThemedText>
            </Pressable>
          ))}
        </Card>

        <Card style={styles.block}>
          <ThemedText type="smallBold">Documentos</ThemedText>
          <Pressable
            onPress={() => void WebBrowser.openBrowserAsync(`${SITE}/terms`)}
            style={styles.linkRow}
          >
            <ThemedText>Termos</ThemedText>
          </Pressable>
          <Pressable
            onPress={() => void WebBrowser.openBrowserAsync(`${SITE}/privacy`)}
            style={styles.linkRow}
          >
            <ThemedText>Privacidade</ThemedText>
          </Pressable>
          <Pressable
            onPress={() => void WebBrowser.openBrowserAsync(`${SITE}/about`)}
            style={styles.linkRow}
          >
            <ThemedText>Sobre</ThemedText>
          </Pressable>
        </Card>

        <Card style={styles.block}>
          <ThemedText type="smallBold">Limpar dados</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Apaga os registros e mantém o login. Digite LIMPAR para confirmar.
          </ThemedText>
          <TextInput
            value={wipeText}
            onChangeText={setWipeText}
            autoCapitalize="characters"
            placeholder="LIMPAR"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />
          <Pressable
            disabled={busy || wipeText.trim().toUpperCase() !== "LIMPAR"}
            onPress={() => void handleWipe()}
            style={[styles.btn, { borderColor: theme.backgroundSelected }]}
          >
            <ThemedText type="smallBold">Limpar dados</ThemedText>
          </Pressable>
        </Card>

        <Card style={styles.block}>
          <ThemedText type="smallBold">Excluir conta</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Apaga a conta e os dados. Digite EXCLUIR para confirmar.
          </ThemedText>
          <TextInput
            value={deleteText}
            onChangeText={setDeleteText}
            autoCapitalize="characters"
            placeholder="EXCLUIR"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />
          <Pressable
            disabled={busy || deleteText.trim().toUpperCase() !== "EXCLUIR"}
            onPress={() => void handleDelete()}
            style={[styles.btn, { borderColor: "#E11D48" }]}
          >
            <ThemedText type="smallBold" style={{ color: "#E11D48" }}>
              Excluir conta
            </ThemedText>
          </Pressable>
        </Card>

        <Banner message={error} />
        <Pressable
          disabled={busy}
          onPress={() => void handleSignOut()}
          style={[styles.out, { borderColor: theme.backgroundSelected }]}
        >
          {busy ? (
            <ActivityIndicator color={theme.text} />
          ) : (
            <ThemedText type="smallBold">Sair</ThemedText>
          )}
        </Pressable>
      </ScrollView>
      <ModuleGuideSheet
        moduleId={guideId}
        open={guideId != null}
        onClose={() => setGuideId(null)}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { padding: Spacing.four, gap: Spacing.four },
  block: { gap: 8, padding: Spacing.three },
  profile: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  profileText: { flex: 1, gap: 2 },
  btn: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  prefRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  prefText: { flex: 1, gap: 2 },
  linkRow: { paddingVertical: 8 },
  input: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  out: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
