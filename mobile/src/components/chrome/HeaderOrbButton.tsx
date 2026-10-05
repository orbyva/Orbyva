import { usePathname, useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import { OrbSphere } from "@/components/orb/OrbSphere";
import { Radius } from "@/constants/theme";
import { useAppShell } from "@/hooks/use-app-shell";
import { useOrbContext } from "@/hooks/useOrb";
import { useTheme } from "@/hooks/use-theme";
import { normalizePath } from "@/lib/nav";

export function HeaderOrbButton() {
  const theme = useTheme();
  const router = useRouter();
  const path = normalizePath(usePathname());
  const orb = useOrbContext();
  const { setAlertsOpen, setQuickAddOpen, setSearchOpen } = useAppShell();

  if (path === "/orb" || path.startsWith("/orb/")) return null;

  const pending = orb?.pendingProposals.length ?? 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={pending > 0 ? "Abrir Orb, proposta pendente" : "Abrir Orb"}
      onPress={() => {
        setQuickAddOpen(false);
        setAlertsOpen(false);
        setSearchOpen(false);
        router.push("/orb");
      }}
      hitSlop={8}
      style={styles.hit}
    >
      <OrbSphere size={22} />
      {pending > 0 ? (
        <View
          style={[
            styles.dot,
            { backgroundColor: theme.primary, borderColor: theme.background },
          ]}
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: {
    minWidth: 36,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 2,
  },
  dot: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 10,
    height: 10,
    borderRadius: Radius.full,
    borderWidth: 2,
  },
});
