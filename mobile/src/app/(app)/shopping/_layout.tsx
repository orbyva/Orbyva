import { Stack } from "expo-router";

import { HeaderChromeRight } from "@/components/chrome/HeaderChromeRight";
import { StackHeaderLeft } from "@/components/chrome/StackHeaderLeft";
import { useTheme } from "@/hooks/use-theme";

export default function ShoppingStackLayout() {
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
      <Stack.Screen name="index" options={{ title: "Lista de compras" }} />
      <Stack.Screen
        name="form"
        options={{
          title: "Novo item",
          presentation: "modal",
          headerLeft: undefined,
          headerRight: undefined,
          headerBackVisible: true,
        }}
      />
      <Stack.Screen
        name="category-form"
        options={{
          title: "Nova categoria",
          presentation: "modal",
          headerLeft: undefined,
          headerRight: undefined,
          headerBackVisible: true,
        }}
      />
    </Stack>
  );
}
