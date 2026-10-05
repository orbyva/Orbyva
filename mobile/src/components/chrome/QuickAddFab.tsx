import Ionicons from "@expo/vector-icons/Ionicons";
import { type Href, usePathname, useRouter } from "expo-router";
import { Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FabSize } from "@/constants/theme";
import { scrim } from "@/domain/ui/color";
import { useAppShell } from "@/hooks/use-app-shell";
import { useModuleColors, useModuleForegrounds } from "@/hooks/use-theme";
import {
  normalizePath,
  quickAddActionsForPath,
  quickAddModuleForPath,
} from "@/lib/nav";

export function QuickAddFab() {
  const moduleColors = useModuleColors();
  const moduleForegrounds = useModuleForegrounds();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const { setAlertsOpen, quickAddOpen, setQuickAddOpen } = useAppShell();
  const actions = quickAddActionsForPath(normalizePath(pathname));
  const module = quickAddModuleForPath(pathname);
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
            router.push(
              {
                pathname: direct.href,
                params: direct.params,
              } as Href,
              { withAnchor: true }
            );
          } else {
            router.push(direct.href, { withAnchor: true });
          }
          return;
        }
        setQuickAddOpen(!quickAddOpen);
      }}
      style={[
        styles.fab,
        {
          backgroundColor: moduleColors[module],
          bottom: Math.max(insets.bottom, 12) + 12,
        },
      ]}
    >
      <Ionicons
        name={quickAddOpen && !direct ? "close" : "add"}
        size={30}
        color={moduleForegrounds[module]}
      />
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
    shadowColor: scrim(1),
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
