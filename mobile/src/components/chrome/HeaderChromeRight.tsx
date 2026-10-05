import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, View } from "react-native";

import { HeaderAlertsButton } from "@/components/chrome/HeaderAlertsButton";
import { HeaderOrbButton } from "@/components/chrome/HeaderOrbButton";
import { useAppShell } from "@/hooks/use-app-shell";
import { useTheme } from "@/hooks/use-theme";

export function HeaderChromeRight() {
  const theme = useTheme();
  const { setSearchOpen, setAlertsOpen, setQuickAddOpen } = useAppShell();

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Buscar"
        onPress={() => {
          setQuickAddOpen(false);
          setAlertsOpen(false);
          setSearchOpen(true);
        }}
        hitSlop={8}
        style={styles.hit}
      >
        <Ionicons name="search-outline" size={22} color={theme.foreground} />
      </Pressable>
      <HeaderOrbButton />
      <HeaderAlertsButton />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  hit: {
    minWidth: 36,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 2,
  },
});
