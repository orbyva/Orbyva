import { Stack } from "expo-router";

import { groupHeaderTitle } from "@/components/chrome/GroupHeaderTitle";
import { HeaderChromeRight } from "@/components/chrome/HeaderChromeRight";
import { StackHeaderLeft } from "@/components/chrome/StackHeaderLeft";
import { HeaderTitle } from "@/domain/ui/typography";
import { useTheme } from "@/hooks/use-theme";
import { formScreenOptions } from "@/lib/formScreen";

export default function FinanceStackLayout() {
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
      <Stack.Screen name="index" options={{ title: "Finanças" }} />
      <Stack.Screen
        name="transactions"
        options={{ gestureEnabled: false, title: "Transações" }}
      />
      <Stack.Screen
        name="recurring"
        options={{ gestureEnabled: false, title: "Recorrências" }}
      />
      <Stack.Screen
        name="budget"
        options={{ gestureEnabled: false, title: "Orçamento" }}
      />
      <Stack.Screen
        name="budget-form"
        options={{
          title: "Orçamento",
          ...formScreenOptions,
        }}
      />
      <Stack.Screen
        name="categories"
        options={{ gestureEnabled: false, title: "Categorias" }}
      />
      <Stack.Screen
        name="form"
        options={{
          title: "Transação",
          ...formScreenOptions,
        }}
      />
      <Stack.Screen
        name="recurring-form"
        options={{
          title: "Nova recorrência",
          ...formScreenOptions,
        }}
      />
      <Stack.Screen
        name="category-form"
        options={{
          title: "Nova categoria",
          ...formScreenOptions,
        }}
      />
    </Stack>
  );
}
