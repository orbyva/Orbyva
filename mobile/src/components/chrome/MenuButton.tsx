import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable } from "react-native";

import { useAppShell } from "@/hooks/use-app-shell";
import { useTheme } from "@/hooks/use-theme";

export function MenuButton() {
  const theme = useTheme();
  const { setSidebarOpen, setQuickAddOpen } = useAppShell();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Abrir menu"
      onPress={() => {
        setQuickAddOpen(false);
        setSidebarOpen(true);
      }}
      hitSlop={8}
      style={{ paddingHorizontal: 4, marginRight: 4 }}
    >
      <Ionicons name="menu-outline" size={24} color={theme.text} />
    </Pressable>
  );
}
