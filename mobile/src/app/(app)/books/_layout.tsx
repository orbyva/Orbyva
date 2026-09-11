import { Stack } from "expo-router";

import { HeaderChromeRight } from "@/components/chrome/HeaderChromeRight";
import { StackHeaderLeft } from "@/components/chrome/StackHeaderLeft";
import { useTheme } from "@/hooks/use-theme";

export default function BooksStackLayout() {
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
      <Stack.Screen name="index" options={{ title: "Livros" }} />
      <Stack.Screen
        name="[id]"
        options={{
          title: "Livro",
          headerBackVisible: true,
          headerLeft: undefined,
        }}
      />
      <Stack.Screen
        name="form"
        options={{
          title: "Novo livro",
          presentation: "modal",
          headerLeft: undefined,
          headerRight: undefined,
          headerBackVisible: true,
        }}
      />
    </Stack>
  );
}
