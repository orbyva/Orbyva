import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { useAppShell } from "@/hooks/use-app-shell";
import { useAuth } from "@/hooks/use-auth";
import { usePlan } from "@/hooks/use-plan";
import { useTheme } from "@/hooks/use-theme";
import { useThemePreference } from "@/hooks/use-theme-preference";
import { PLANS } from "@/lib/plan";
import { getErrorMessage } from "@/lib/errors";
import { AUTH_STORAGE_KEY } from "@/lib/supabase";
import { secureStoreAdapter } from "@/lib/secure-store";

export default function AccountScreen() {
  const { user, signOut } = useAuth();
  const theme = useTheme();
  const { scheme, toggleScheme } = useThemePreference();
  const plan = usePlan();
  const { bottomInset } = useAppShell();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function handleSignOut() {
    setBusy(true);
    setError(null);
    try {
      await signOut();
      await secureStoreAdapter.removeItem(AUTH_STORAGE_KEY);
    } catch (err) {
      setError(getErrorMessage(err, "Não foi possível sair."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ThemedView style={[styles.body, { paddingBottom: bottomInset + 24 }]}>
      <ThemedText type="subtitle">Conta</ThemedText>
      <View style={styles.block}>
        <ThemedText type="small" themeColor="textSecondary">
          E-mail
        </ThemedText>
        <ThemedText>{user?.email ?? "sem e-mail"}</ThemedText>
      </View>
      <View style={styles.block}>
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
              Assinatura e upgrade continuam no web (orbyva.app/account).
            </ThemedText>
          </>
        )}
      </View>
      <View style={styles.block}>
        <ThemedText type="small" themeColor="textSecondary">
          Aparência
        </ThemedText>
        <Pressable
          accessibilityRole="button"
          onPress={toggleScheme}
          style={[
            styles.themeBtn,
            {
              borderColor: theme.backgroundSelected,
              backgroundColor: theme.backgroundElement,
            },
          ]}
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
      </View>
      {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}
      <Pressable
        accessibilityRole="button"
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
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, padding: Spacing.four, gap: Spacing.four },
  block: { gap: 4 },
  themeBtn: {
    marginTop: 8,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  out: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: "auto",
  },
  error: { color: "#E11D48" },
});
