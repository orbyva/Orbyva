import { Redirect, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet } from "react-native";
import * as Linking from "expo-linking";

import { ThemedView } from "@/components/themed-view";
import { Banner } from "@/components/ui/Banner";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { createSessionFromUrl } from "@/lib/auth-session";
import { getErrorMessage } from "@/lib/errors";

export default function AuthCallback() {
  const { user } = useAuth();
  const theme = useTheme();
  const params = useLocalSearchParams<{ error?: string }>();
  const [error, setError] = useState<string | null>(
    typeof params.error === "string" ? params.error : null
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const url = await Linking.getInitialURL();
      if (!url || cancelled) return;
      try {
        await createSessionFromUrl(url);
      } catch (err) {
        if (!cancelled) {
          setError(getErrorMessage(err, "Não foi possível concluir o login."));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (user) return <Redirect href="/(app)/finance" />;

  return (
    <ThemedView style={styles.center}>
      {error ? (
        <Banner message={error} />
      ) : (
        <ActivityIndicator color={theme.primary} />
      )}
      {error ? <Redirect href="/login" /> : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  error: { textAlign: "center" },
});
