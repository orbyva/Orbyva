import { Stack } from "expo-router";

import { HeaderChromeRight } from "@/components/chrome/HeaderChromeRight";
import { StackHeaderLeft } from "@/components/chrome/StackHeaderLeft";
import { useTheme } from "@/hooks/use-theme";
import { formScreenOptions } from "@/lib/formScreen";

export const unstable_settings = {
  initialRouteName: "index",
};

export default function LinksStackLayout() {
  const theme = useTheme();

  return (
    <Stack
      initialRouteName="index"
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
      <Stack.Screen name="index" options={{ title: "Links" }} />
      <Stack.Screen
        name="form"
        options={{
          title: "Novo link",
          ...formScreenOptions,
        }}
      />
    </Stack>
  );
}
