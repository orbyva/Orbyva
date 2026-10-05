import { Stack } from "expo-router";

import { groupHeaderTitle } from "@/components/chrome/GroupHeaderTitle";
import { HeaderChromeRight } from "@/components/chrome/HeaderChromeRight";
import { StackHeaderLeft } from "@/components/chrome/StackHeaderLeft";
import { HeaderTitle } from "@/domain/ui/typography";
import { useTheme } from "@/hooks/use-theme";
import { formScreenOptions } from "@/lib/formScreen";

export default function TasksStackLayout() {
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
      <Stack.Screen name="index" options={{ title: "Tarefas" }} />
      <Stack.Screen
        name="agenda"
        options={{ gestureEnabled: false, title: "Agenda" }}
      />
      <Stack.Screen
        name="live"
        options={{ gestureEnabled: false, title: "Live" }}
      />
      <Stack.Screen
        name="projects"
        options={{ gestureEnabled: false, headerShown: false }}
      />
      <Stack.Screen name="tags" options={{ title: "Tags" }} />
      <Stack.Screen name="link-icons" options={{ title: "Ícones de link" }} />
      <Stack.Screen name="event-invites" options={{ title: "Convidar" }} />
      <Stack.Screen
        name="event-invite/[token]"
        options={{ title: "Convite" }}
      />
      <Stack.Screen
        name="form"
        options={{
          title: "Nova tarefa",
          ...formScreenOptions,
        }}
      />
    </Stack>
  );
}
