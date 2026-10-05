import { useCallback } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { usePathname, useRouter, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { OrbActionCard } from "@/components/orb/OrbActionCard";
import { ThemedText } from "@/components/themed-text";
import { Radius, Spacing } from "@/constants/theme";
import { scrim } from "@/domain/ui/color";
import { useOrbContext } from "@/hooks/useOrb";
import { useFeedback } from "@/hooks/use-toast";
import { useTheme } from "@/hooks/use-theme";
import { normalizePath } from "@/lib/nav";

/**
 * Tray de propostas fora da `/orb` — confirma criação depois que a Orb navegou.
 */
export function OrbProposalTray() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const path = normalizePath(pathname);
  const router = useRouter();
  const orb = useOrbContext();
  const { ok } = useFeedback();

  const onCreated = useCallback(
    (resultado: { message: string; link?: string }) => {
      ok(resultado.message);
      if (resultado.link) {
        // link mobile já é path absoluto relativo ao app
        try {
          router.push(resultado.link as Href);
        } catch {
          // ignore
        }
      }
    },
    [ok, router]
  );

  if (!orb || orb.pendingProposals.length === 0) return null;
  if (path === "/orb" || path.startsWith("/orb/")) return null;

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.rail,
        { paddingBottom: Math.max(insets.bottom, 12) + 80 },
      ]}
    >
      <View
        style={[
          styles.panel,
          {
            backgroundColor: theme.card,
            borderColor: theme.border,
          },
        ]}
      >
        <View style={styles.head}>
          <ThemedText type="smallBold">
            {orb.pendingProposals.length > 1
              ? `A Orb preparou ${orb.pendingProposals.length} criações`
              : "A Orb preparou uma criação"}
          </ThemedText>
          <Pressable onPress={() => router.push("/orb")} hitSlop={8}>
            <ThemedText type="small" style={{ color: theme.primary }}>
              Abrir chat
            </ThemedText>
          </Pressable>
        </View>
        {orb.pendingProposals.map((pendente) => (
          <OrbActionCard
            key={pendente.callId}
            callId={pendente.callId}
            proposal={pendente.proposal}
            onCreated={onCreated}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 46,
    paddingHorizontal: Spacing.three,
    alignItems: "flex-end",
  },
  panel: {
    width: "100%",
    maxWidth: 400,
    borderRadius: Radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.two,
    gap: Spacing.two,
    shadowColor: scrim(1),
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.one,
  },
});
