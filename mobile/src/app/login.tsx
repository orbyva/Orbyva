import * as AppleAuthentication from "expo-apple-authentication";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { Redirect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { useThemePreference } from "@/hooks/use-theme-preference";
import {
  authRedirectUri,
  createSessionFromUrl,
  googleRedirectConfigHint,
  urlLooksLikeWebsiteFallback,
} from "@/lib/auth-session";
import { getErrorMessage } from "@/lib/errors";
import { supabase } from "@/lib/supabase";

WebBrowser.maybeCompleteAuthSession();

type Mode = "login" | "signup";

export default function LoginScreen() {
  const { user, loading } = useAuth();
  const theme = useTheme();
  const { scheme } = useThemePreference();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "ios") return;
    void AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
  }, []);

  if (!loading && user) return <Redirect href="/(app)/home" />;

  async function withBusy(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await fn();
    } catch (err) {
      setError(getErrorMessage(err, "Não foi possível entrar."));
    } finally {
      setBusy(false);
    }
  }

  async function handleEmail() {
    await withBusy(async () => {
      const trimmed = email.trim();
      if (mode === "login") {
        const { error: signError } = await supabase.auth.signInWithPassword({
          email: trimmed,
          password,
        });
        if (signError) throw signError;
        return;
      }
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: trimmed,
        password,
        options: { emailRedirectTo: authRedirectUri() },
      });
      if (signUpError) throw signUpError;
      if (!data.session) {
        setMessage(
          "Conta criada. Confirme o e-mail que acabamos de enviar para entrar."
        );
      }
    });
  }

  async function handleMagicLink() {
    await withBusy(async () => {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: authRedirectUri(),
          shouldCreateUser: false,
        },
      });
      if (otpError) throw otpError;
      setMessage("Enviamos um link de login para o seu e-mail.");
    });
  }

  async function handleGoogle() {
    await withBusy(async () => {
      const redirectTo = authRedirectUri();
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      });
      if (oauthError) throw oauthError;
      if (!data.url) throw new Error("Não foi possível abrir o Google.");
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo, {
        preferEphemeralSession: true,
      });
      const resultUrl = "url" in result ? result.url : undefined;
      if (resultUrl) {
        const ok = await createSessionFromUrl(resultUrl);
        if (ok) return;
        if (urlLooksLikeWebsiteFallback(resultUrl)) {
          throw new Error(googleRedirectConfigHint(redirectTo));
        }
      }
      if (result.type !== "success") {
        throw new Error(googleRedirectConfigHint(redirectTo));
      }
    });
  }

  async function handleApple() {
    await withBusy(async () => {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) {
        throw new Error("A Apple não devolveu o token de identidade.");
      }
      const { error: appleError } = await supabase.auth.signInWithIdToken({
        provider: "apple",
        token: credential.identityToken,
      });
      if (appleError) throw appleError;
    });
  }

  const inputStyle = [
    styles.input,
    {
      color: theme.text,
      backgroundColor: theme.backgroundElement,
      borderColor: theme.backgroundSelected,
    },
  ];

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.body}>
            <ThemedText type="subtitle">Orbyva</ThemedText>
            <ThemedText themeColor="textSecondary">
              {mode === "signup"
                ? "7 dias grátis com tudo liberado. Sem cartão no início."
                : "Entre com a mesma conta do web."}
            </ThemedText>

            <View style={styles.modeRow}>
              <Pressable
                onPress={() => setMode("login")}
                style={[
                  styles.modeChip,
                  { backgroundColor: theme.backgroundElement },
                  mode === "login" && { backgroundColor: theme.backgroundSelected },
                ]}
              >
                <ThemedText type="smallBold">Entrar</ThemedText>
              </Pressable>
              <Pressable
                onPress={() => setMode("signup")}
                style={[
                  styles.modeChip,
                  { backgroundColor: theme.backgroundElement },
                  mode === "signup" && { backgroundColor: theme.backgroundSelected },
                ]}
              >
                <ThemedText type="smallBold">Criar conta</ThemedText>
              </Pressable>
            </View>

            <TextInput
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              placeholder="E-mail"
              placeholderTextColor={theme.textSecondary}
              style={inputStyle}
              value={email}
              onChangeText={setEmail}
            />
            <TextInput
              autoCapitalize="none"
              autoComplete={mode === "login" ? "password" : "new-password"}
              placeholder="Senha"
              placeholderTextColor={theme.textSecondary}
              secureTextEntry
              style={inputStyle}
              value={password}
              onChangeText={setPassword}
            />

            {error ? (
              <ThemedText style={styles.error}>{error}</ThemedText>
            ) : null}
            {message ? (
              <ThemedText themeColor="textSecondary">{message}</ThemedText>
            ) : null}

            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void handleEmail()}
              style={[styles.primary, { backgroundColor: theme.primary }]}
            >
              {busy ? (
                <ActivityIndicator color="#0B0F1A" />
              ) : (
                <ThemedText type="smallBold" style={styles.primaryLabel}>
                  {mode === "signup" ? "Criar conta" : "Entrar"}
                </ThemedText>
              )}
            </Pressable>

            <Pressable disabled={busy} onPress={() => void handleMagicLink()}>
              <ThemedText type="linkPrimary">Enviar link mágico</ThemedText>
            </Pressable>

            <Pressable
              disabled={busy}
              onPress={() => void handleGoogle()}
              style={[
                styles.secondary,
                { borderColor: theme.backgroundSelected },
              ]}
            >
              <ThemedText type="smallBold">Continuar com Google</ThemedText>
            </Pressable>

            <ThemedText type="small" themeColor="textSecondary" selectable>
              No Supabase, Redirect URLs (não mude o Site URL):
              {"\n"}
              orbyva://auth/callback
              {"\n"}
              orbyva://**
            </ThemedText>

            {appleAvailable ? (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={
                  scheme === "dark"
                    ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                    : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                }
                cornerRadius={12}
                style={styles.apple}
                onPress={() => void handleApple()}
              />
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: {
    flex: 1,
    padding: Spacing.four,
    gap: Spacing.three,
    justifyContent: "center",
  },
  modeRow: { flexDirection: "row", gap: Spacing.two },
  modeChip: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 999,
  },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  primary: {
    height: 48,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryLabel: { color: "#0B0F1A" },
  secondary: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  apple: { height: 48, width: "100%" },
  error: { color: "#E11D48" },
});
