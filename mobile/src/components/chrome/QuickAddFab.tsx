import { type Href, usePathname, useRouter } from "expo-router";
import { Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { FabSize } from "@/constants/theme";
import { useAppShell } from "@/hooks/use-app-shell";
import { useTheme } from "@/hooks/use-theme";
import { normalizePath, quickAddActionsForPath } from "@/lib/nav";

export function QuickAddFab() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const { setAlertsOpen, quickAddOpen, setQuickAddOpen } = useAppShell();
  const actions = quickAddActionsForPath(normalizePath(pathname));
  const direct =
    actions.length === 1 && actions[0]?.href ? actions[0] : null;

  if (actions.length === 0) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={direct?.label ?? "Adicionar"}
      onPress={() => {
        setAlertsOpen(false);
        if (direct?.href) {
          if (direct.params) {
            router.push({
              pathname: direct.href,
              params: direct.params,
            } as Href);
          } else {
            router.push(direct.href);
          }
          return;
        }
        setQuickAddOpen(!quickAddOpen);
      }}
      style={[
        styles.fab,
        {
          backgroundColor: theme.primary,
          bottom: Math.max(insets.bottom, 12) + 12,
        },
      ]}
    >
      <ThemedText type="smallBold" style={styles.label}>
        {quickAddOpen && !direct ? "×" : "+"}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    right: 20,
    zIndex: 50,
    width: FabSize,
    height: FabSize,
    borderRadius: FabSize / 2,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0B0F1A",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  label: { color: "#0B0F1A", fontSize: 28, lineHeight: 32 },
});
