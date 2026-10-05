// Import por peso: a raiz do pacote puxa todos os pesos e itálicos para o bundle (~1,7 MB).
import { PlusJakartaSans_400Regular } from "@expo-google-fonts/plus-jakarta-sans/400Regular";
import { PlusJakartaSans_500Medium } from "@expo-google-fonts/plus-jakarta-sans/500Medium";
import { PlusJakartaSans_600SemiBold } from "@expo-google-fonts/plus-jakarta-sans/600SemiBold";
import { PlusJakartaSans_700Bold } from "@expo-google-fonts/plus-jakarta-sans/700Bold";
import { Syne_600SemiBold } from "@expo-google-fonts/syne/600SemiBold";
import { Syne_700Bold } from "@expo-google-fonts/syne/700Bold";
import { useFonts } from "expo-font";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, type ReactNode } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { BootSplash } from "@/components/BootSplash";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import {
  ThemePreferenceProvider,
  useThemePreference,
} from "@/hooks/use-theme-preference";
import { ToastProvider } from "@/hooks/use-toast";

SplashScreen.preventAutoHideAsync();

/**
 * O splash nativo só conhece o tema do sistema. Assim que a preferência salva é lida, ele dá lugar
 * ao `BootSplash`, que usa o tema escolhido no app, até fontes e sessão carregarem.
 */
function SplashGate({ children }: { children: ReactNode }) {
  const { loading } = useAuth();
  const { ready, scheme } = useThemePreference();
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    Syne_600SemiBold,
    Syne_700Bold,
  });
  // Erro de fonte não pode prender o app no splash: segue com a fonte do sistema.
  const fontsSettled = fontsLoaded || fontError !== null;
  const booting = loading || !fontsSettled;

  useEffect(() => {
    if (ready) {
      void SplashScreen.hideAsync();
    }
  }, [ready]);

  if (!ready) return null;
  return (
    <>
      {fontsSettled ? children : null}
      {booting ? <BootSplash scheme={scheme} /> : null}
    </>
  );
}

function RootStack() {
  const { scheme } = useThemePreference();
  const theme = scheme === "dark" ? DarkTheme : DefaultTheme;

  return (
    <ThemeProvider value={theme}>
      <SplashGate>
        <ToastProvider>
          <Stack screenOptions={{ headerShown: false, animation: "fade" }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="login" />
            <Stack.Screen name="auth/callback" />
            <Stack.Screen name="(app)" />
          </Stack>
          <StatusBar style={scheme === "dark" ? "light" : "dark"} />
        </ToastProvider>
      </SplashGate>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemePreferenceProvider>
          <AuthProvider>
            <RootStack />
          </AuthProvider>
        </ThemePreferenceProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
