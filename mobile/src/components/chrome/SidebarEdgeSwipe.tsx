import { usePathname } from "expo-router";
import type { ReactNode } from "react";
import { StyleSheet } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";

import { useAppShell } from "@/hooks/use-app-shell";
import { navLeafForPath } from "@/lib/nav";

const EDGE_WIDTH = 24;
const OPEN_DISTANCE = 48;
const OPEN_VELOCITY = 500;

/**
 * Arrastar da borda esquerda abre a sidebar, só em tela raiz (item da sidebar). Em detalhe a
 * borda é o voltar nativo do iOS, então o gesto fica desligado ali.
 */
export function SidebarEdgeSwipe({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { sidebarOpen, setSidebarOpen } = useAppShell();
  const enabled = !sidebarOpen && navLeafForPath(pathname) != null;

  const pan = Gesture.Pan()
    .enabled(enabled)
    .hitSlop({ left: 0, width: EDGE_WIDTH })
    .activeOffsetX(16)
    .failOffsetY([-16, 16])
    .runOnJS(true)
    .onEnd((event) => {
      if (event.translationX > OPEN_DISTANCE || event.velocityX > OPEN_VELOCITY) {
        setSidebarOpen(true);
      }
    });

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={styles.flex}>{children}</Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
