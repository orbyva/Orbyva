import { Stack } from "expo-router";

import { HeaderChromeRight } from "@/components/chrome/HeaderChromeRight";
import { StackHeaderLeft } from "@/components/chrome/StackHeaderLeft";
import { useTheme } from "@/hooks/use-theme";

export default function FinanceStackLayout() {
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
      <Stack.Screen name="index" options={{ title: "Finanças" }} />
      <Stack.Screen name="transactions" options={{ title: "Transações" }} />
      <Stack.Screen name="recurring" options={{ title: "Recorrências" }} />
      <Stack.Screen name="budget" options={{ title: "Orçamento" }} />
      <Stack.Screen
        name="budget-form"
        options={{
          title: "Orçamento",
          presentation: "modal",
          headerLeft: undefined,
          headerRight: undefined,
          headerBackVisible: true,
        }}
      />
      <Stack.Screen name="categories" options={{ title: "Categorias" }} />
      <Stack.Screen
        name="form"
        options={{
          title: "Transação",
          presentation: "modal",
          headerLeft: undefined,
          headerRight: undefined,
          headerBackVisible: true,
        }}
      />
      <Stack.Screen
        name="recurring-form"
        options={{
          title: "Nova recorrência",
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
