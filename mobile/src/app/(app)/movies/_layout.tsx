import { Stack } from "expo-router";

import { HeaderChromeRight } from "@/components/chrome/HeaderChromeRight";
import { StackHeaderLeft } from "@/components/chrome/StackHeaderLeft";
import { useTheme } from "@/hooks/use-theme";
import { formScreenOptions } from "@/lib/formScreen";

export default function MoviesStackLayout() {
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
      <Stack.Screen name="index" options={{ title: "Cinema" }} />
      <Stack.Screen
        name="[id]"
        options={{
          title: "Título",
          headerBackVisible: true,
          headerLeft: undefined,
        }}
      />
      <Stack.Screen
        name="form"
        options={{
          title: "Novo título",
          ...formScreenOptions,
        }}
      />
    </Stack>
  );
}
