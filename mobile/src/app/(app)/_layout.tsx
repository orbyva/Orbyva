import { Redirect, Stack, usePathname } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { AlertsSheet } from "@/components/chrome/AlertsSheet";
import { AppSidebar } from "@/components/chrome/AppSidebar";
import { HeaderAlertsButton } from "@/components/chrome/HeaderAlertsButton";
import { QuickAddFab } from "@/components/chrome/QuickAddFab";
import { QuickAddSheet } from "@/components/chrome/QuickAddSheet";
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
  return <HeaderAlertsButton />;
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
        <Stack.Screen name="account" options={{ title: "Conta" }} />
      </Stack>
      <QuickAddFab />
      <QuickAddSheet />
      <AppSidebar />
      <AlertsSheet />
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
