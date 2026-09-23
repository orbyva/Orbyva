import * as AppleAuthentication from "expo-apple-authentication";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { Redirect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";

import { BrandLogo } from "@/components/BrandLogo";
import { BrandWordmark } from "@/components/BrandWordmark";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Banner } from "@/components/ui/Banner";
import { ChipBar } from "@/components/ChipBar";
import { Spacing } from "@/constants/theme";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { useThemePreference } from "@/hooks/use-theme-preference";
import { useFeedback } from "@/hooks/use-toast";
import {
  authRedirectUri,
  createSessionFromUrl,
  googleRedirectConfigHint,
  urlLooksLikeWebsiteFallback,
} from "@/lib/auth-session";
import {
  EXISTING_ACCOUNT_SIGNUP_MESSAGE,
  isDuplicateEmailSignUp,
} from "@/lib/auth-signup";
import { getErrorMessage } from "@/lib/errors";
import { supabase } from "@/lib/supabase";

WebBrowser.maybeCompleteAuthSession();

type Mode = "login" | "signup";

export default function LoginScreen() {
  const { user, loading } = useAuth();
  const theme = useTheme();
  const { fail } = useFeedback();
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
      fail(getErrorMessage(err, "Não foi possível entrar."));
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
      if (data.session) return;
      if (isDuplicateEmailSignUp(data)) {
        throw new Error(EXISTING_ACCOUNT_SIGNUP_MESSAGE);
      }
      setMessage(
        "Conta criada. Confirme o e-mail que acabamos de enviar para entrar."
      );
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
          keyboardVerticalOffset={12}
        >
          <ScrollView
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.brand}>
              <BrandLogo size={56} />
              <BrandWordmark />
            </View>
            <ThemedText themeColor="textSecondary" style={styles.subtitle}>
              {mode === "signup"
                ? "7 dias grátis com tudo liberado."
                : "Entre com a mesma conta do web."}
            </ThemedText>

            <ChipBar
              options={[
                { id: "login" as const, label: "Entrar" },
                { id: "signup" as const, label: "Criar conta" },
              ]}
              value={mode}
              onChange={setMode}
            />

            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void handleGoogle()}
              style={[
                styles.google,
                {
                  backgroundColor: theme.background,
                  borderColor: theme.backgroundSelected,
                },
              ]}
            >
              <Ionicons name="logo-google" size={18} color={theme.text} />
              <ThemedText type="smallBold">Continuar com Google</ThemedText>
            </Pressable>

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

            <View style={styles.divider}>
              <View
                style={[styles.dividerLine, { backgroundColor: theme.backgroundSelected }]}
              />
              <ThemedText type="small" themeColor="textSecondary">
                ou
              </ThemedText>
              <View
                style={[styles.dividerLine, { backgroundColor: theme.backgroundSelected }]}
              />
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

            <Banner message={error} />
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

            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void handleMagicLink()}
              style={[
                styles.magic,
                {
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.primary,
                },
              ]}
            >
              <Ionicons name="mail-outline" size={18} color={theme.primary} />
              <ThemedText type="smallBold" style={{ color: theme.primary }}>
                Enviar link mágico
              </ThemedText>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: {
    flexGrow: 1,
    padding: Spacing.four,
    gap: Spacing.three,
    justifyContent: "center",
  },
  brand: {
    alignItems: "center",
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  subtitle: { textAlign: "center" },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  primary: {
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryLabel: { color: "#0B0F1A" },
  magic: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  google: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    marginVertical: 2,
  },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  apple: { height: 48, width: "100%" },
});
