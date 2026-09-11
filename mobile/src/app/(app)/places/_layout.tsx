import { Stack } from "expo-router";

import { HeaderChromeRight } from "@/components/chrome/HeaderChromeRight";
import { StackHeaderLeft } from "@/components/chrome/StackHeaderLeft";
import { useTheme } from "@/hooks/use-theme";

export default function PlacesStackLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.text,
        contentStyle: { backgroundColor: theme.background },
        headerLeft: () => <StackHeaderLeft />,
        headerRight: () => <HeaderChromeRight />,
        headerBackVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ title: "Lugares" }} />
      <Stack.Screen
        name="[id]"
        options={{
          title: "Lugar",
          headerBackVisible: true,
          headerLeft: undefined,
        }}
      />
      <Stack.Screen
        name="form"
        options={{
          title: "Novo lugar",
          presentation: "modal",
          headerLeft: undefined,
          headerRight: undefined,
          headerBackVisible: true,
        }}
      />
    </Stack>
  );
}
