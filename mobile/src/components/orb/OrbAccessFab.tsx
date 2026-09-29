import { Pressable, StyleSheet, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BrandLogo } from "@/components/BrandLogo";
import { FabSize } from "@/constants/theme";
import { useOrbContext } from "@/hooks/useOrb";
import { useTheme } from "@/hooks/use-theme";
import { normalizePath } from "@/lib/nav";

/**
 * Acesso rápido à Orb (fase 2): abre a tela `/orb` de qualquer módulo.
 * Escondido na própria `/orb` e em forms.
 */
export function OrbAccessFab() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const path = normalizePath(pathname);
  const orb = useOrbContext();

  if (path === "/orb" || path.startsWith("/orb/")) return null;
  if (path.endsWith("/form") || path.endsWith("-form")) return null;
  if (path === "/account" || path.startsWith("/account/")) return null;

  const pending = orb?.pendingProposals.length ?? 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Abrir Orb"
      onPress={() => router.push("/orb")}
      style={[
        styles.fab,
        {
          backgroundColor: theme.surface,
          borderColor: theme.primary,
          bottom: Math.max(insets.bottom, 12) + 12 + FabSize + 12,
        },
      ]}
    >
      <BrandLogo size={28} />
      {pending > 0 ? (
        <View style={[styles.badge, { backgroundColor: theme.primary }]}>
          <View style={styles.badgeDot} />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    right: 20,
    zIndex: 48,
    width: FabSize,
    height: FabSize,
    borderRadius: FabSize / 2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    shadowColor: "#0B0F1A",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  badge: {
    position: "absolute",
    top: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff" },
});
