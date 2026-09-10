import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, type ReactNode } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { AuthProvider, useAuth } from "@/hooks/use-auth";
import {
  ThemePreferenceProvider,
  useThemePreference,
} from "@/hooks/use-theme-preference";

SplashScreen.preventAutoHideAsync();

function SplashGate({ children }: { children: ReactNode }) {
  const { loading } = useAuth();
  const { ready } = useThemePreference();
  const show = !loading && ready;

  useEffect(() => {
    if (show) {
      void SplashScreen.hideAsync();
    }
  }, [show]);

  if (!ready) return null;
  return children;
}

function RootStack() {
  const { scheme } = useThemePreference();
  const theme = scheme === "dark" ? DarkTheme : DefaultTheme;

  return (
    <ThemeProvider value={theme}>
      <SplashGate>
        <Stack screenOptions={{ headerShown: false, animation: "fade" }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="login" />
          <Stack.Screen name="auth/callback" />
          <Stack.Screen name="(app)" />
        </Stack>
        <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      </SplashGate>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemePreferenceProvider>
        <AuthProvider>
          <RootStack />
        </AuthProvider>
      </ThemePreferenceProvider>
    </GestureHandlerRootView>
  );
}
