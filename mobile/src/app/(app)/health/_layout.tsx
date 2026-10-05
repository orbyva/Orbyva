import { Stack } from "expo-router";

import { groupHeaderTitle } from "@/components/chrome/GroupHeaderTitle";
import { HeaderChromeRight } from "@/components/chrome/HeaderChromeRight";
import { StackHeaderLeft } from "@/components/chrome/StackHeaderLeft";
import { HeaderTitle } from "@/domain/ui/typography";
import { useTheme } from "@/hooks/use-theme";
import { formScreenOptions } from "@/lib/formScreen";

export default function HealthStackLayout() {
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
      <Stack.Screen name="index" options={{ title: "Saúde" }} />
      <Stack.Screen
        name="form"
        options={{
          title: "Nova medicação",
          ...formScreenOptions,
        }}
      />
      <Stack.Screen
        name="consult-form"
        options={{
          title: "Nova consulta",
          ...formScreenOptions,
        }}
      />
      <Stack.Screen name="reminders" options={{ title: "Lembretes" }} />
      <Stack.Screen name="progress" options={{ title: "Progresso" }} />
      <Stack.Screen name="consultations" options={{ title: "Consultas" }} />
      <Stack.Screen
        name="metric-form"
        options={{
          title: "Nova medição",
          ...formScreenOptions,
        }}
      />
    </Stack>
  );
}
