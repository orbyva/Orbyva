import { Stack } from "expo-router";

import { HeaderChromeRight } from "@/components/chrome/HeaderChromeRight";
import { StackHeaderLeft } from "@/components/chrome/StackHeaderLeft";
import { useTheme } from "@/hooks/use-theme";

export default function HealthStackLayout() {
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
      <Stack.Screen name="index" options={{ title: "Saúde" }} />
      <Stack.Screen
        name="form"
        options={{
          title: "Nova medicação",
          presentation: "modal",
          headerLeft: undefined,
          headerRight: undefined,
          headerBackVisible: true,
        }}
      />
      <Stack.Screen
        name="consult-form"
        options={{
          title: "Nova consulta",
          presentation: "modal",
          headerLeft: undefined,
          headerRight: undefined,
          headerBackVisible: true,
        }}
      />
      <Stack.Screen
        name="metric-form"
        options={{
          title: "Nova medição",
          presentation: "modal",
          headerLeft: undefined,
          headerRight: undefined,
          headerBackVisible: true,
        }}
      />
    </Stack>
  );
}
