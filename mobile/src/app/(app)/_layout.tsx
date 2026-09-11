import { Redirect, Stack, usePathname } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { AlertsSheet } from "@/components/chrome/AlertsSheet";
import { AppSidebar } from "@/components/chrome/AppSidebar";
import { HeaderChromeRight } from "@/components/chrome/HeaderChromeRight";
import { ModuleGuideHost } from "@/components/chrome/ModuleGuideHost";
import { OnboardingHost } from "@/components/chrome/OnboardingHost";
import { QuickAddFab } from "@/components/chrome/QuickAddFab";
import { QuickAddSheet } from "@/components/chrome/QuickAddSheet";
import { SearchSheet } from "@/components/chrome/SearchSheet";
import { StackHeaderLeft } from "@/components/chrome/StackHeaderLeft";
import { ThemedView } from "@/components/themed-view";
import { AppShellProvider } from "@/hooks/use-app-shell";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { normalizePath } from "@/lib/nav";

function AppHeaderLeft() {
  return <StackHeaderLeft />;
}

function AppHeaderRight() {
  return <HeaderChromeRight />;
}

function AppStack() {
  const theme = useTheme();
  const pathname = usePathname();
  const path = normalizePath(pathname);
  const hideChrome = path.endsWith("/form") || path.endsWith("-form");

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <Stack
        initialRouteName="home"
        screenOptions={{
          headerShadowVisible: false,
          headerStyle: { backgroundColor: theme.background },
          headerTintColor: theme.text,
          contentStyle: { backgroundColor: theme.background },
          headerLeft: hideChrome ? undefined : AppHeaderLeft,
          headerRight: hideChrome ? undefined : AppHeaderRight,
          headerBackVisible: false,
        }}
      >
        <Stack.Screen name="home" options={{ title: "Início" }} />
        <Stack.Screen name="timeline" options={{ title: "Timeline" }} />
        <Stack.Screen name="finance" options={{ headerShown: false }} />
        <Stack.Screen name="tasks" options={{ headerShown: false }} />
        <Stack.Screen name="notes" options={{ headerShown: false }} />
        <Stack.Screen name="shopping" options={{ headerShown: false }} />
        <Stack.Screen name="habits" options={{ headerShown: false }} />
        <Stack.Screen name="health" options={{ headerShown: false }} />
        <Stack.Screen name="goals" options={{ headerShown: false }} />
        <Stack.Screen name="places" options={{ headerShown: false }} />
        <Stack.Screen name="travel" options={{ headerShown: false }} />
        <Stack.Screen name="cars" options={{ headerShown: false }} />
        <Stack.Screen name="movies" options={{ headerShown: false }} />
        <Stack.Screen name="books" options={{ headerShown: false }} />
        <Stack.Screen name="music" options={{ headerShown: false }} />
        <Stack.Screen name="links" options={{ headerShown: false }} />
        <Stack.Screen name="account" options={{ title: "Conta" }} />
      </Stack>
      <QuickAddFab />
      <QuickAddSheet />
      <AppSidebar />
      <AlertsSheet />
      <SearchSheet />
      <ModuleGuideHost />
      <OnboardingHost />
    </View>
  );
}

export default function AppLayout() {
  const { user, loading } = useAuth();
  const theme = useTheme();

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator color={theme.primary} />
      </ThemedView>
    );
  }

  if (!user) return <Redirect href="/login" />;

  return (
    <AppShellProvider>
      <AppStack />
    </AppShellProvider>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
