import { Stack } from "expo-router";

import { groupHeaderTitle } from "@/components/chrome/GroupHeaderTitle";
import { HeaderChromeRight } from "@/components/chrome/HeaderChromeRight";
import { StackHeaderLeft } from "@/components/chrome/StackHeaderLeft";
import { HeaderTitle } from "@/domain/ui/typography";
import { useTheme } from "@/hooks/use-theme";
import { formScreenOptions } from "@/lib/formScreen";

export default function CarsStackLayout() {
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
      <Stack.Screen name="index" options={{ title: "Veículos" }} />
      <Stack.Screen
        name="[id]"
        options={{
          title: "Veículo",
          headerBackVisible: true,
          headerLeft: undefined,
        }}
      />
      <Stack.Screen
        name="form"
        options={{
          title: "Novo veículo",
          ...formScreenOptions,
        }}
      />
      <Stack.Screen
        name="maint-form"
        options={{
          title: "Nova manutenção",
          ...formScreenOptions,
        }}
      />
      <Stack.Screen
        name="fuel-form"
        options={{
          title: "Abastecimento",
          ...formScreenOptions,
        }}
      />
      <Stack.Screen
        name="doc-form"
        options={{
          title: "Novo documento",
          ...formScreenOptions,
        }}
      />
    </Stack>
  );
}
