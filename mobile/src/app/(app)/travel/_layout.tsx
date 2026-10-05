import { Stack } from "expo-router";

import { groupHeaderTitle } from "@/components/chrome/GroupHeaderTitle";
import { HeaderChromeRight } from "@/components/chrome/HeaderChromeRight";
import { StackHeaderLeft } from "@/components/chrome/StackHeaderLeft";
import { HeaderTitle } from "@/domain/ui/typography";
import { useTheme } from "@/hooks/use-theme";
import { formScreenOptions } from "@/lib/formScreen";

export default function TravelStackLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.foreground,
        headerTitleStyle: HeaderTitle,
        headerTitle: groupHeaderTitle,
        contentStyle: { backgroundColor: theme.background },
        headerLeft: () => <StackHeaderLeft />,
        headerRight: () => <HeaderChromeRight />,
        headerBackVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ title: "Viagens" }} />
      <Stack.Screen
        name="[id]"
        options={{
          title: "Viagem",
          headerBackVisible: true,
          headerLeft: undefined,
        }}
      />
      <Stack.Screen
        name="form"
        options={{
          title: "Nova viagem",
          ...formScreenOptions,
        }}
      />
      <Stack.Screen
        name="expense-form"
        options={{
          title: "Gasto",
          ...formScreenOptions,
        }}
      />
      <Stack.Screen
        name="invite/[token]"
        options={{
          title: "Convite",
          headerBackVisible: true,
          headerLeft: undefined,
        }}
      />
    </Stack>
  );
}
