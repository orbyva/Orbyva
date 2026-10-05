import { Image, StyleSheet, View } from "react-native";

import { bootSplashBackground, SPLASH_LOGO_SIZE } from "@/domain/ui/bootSplash";
import type { ThemeScheme } from "@/hooks/use-theme-preference";

export function BootSplash({ scheme }: { scheme: ThemeScheme }) {
  return (
    <View
      style={[styles.fill, { backgroundColor: bootSplashBackground(scheme) }]}
      accessibilityLabel="Carregando o Orbyva"
    >
      <Image
        source={require("../../assets/images/splash-icon.png")}
        style={styles.logo}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  logo: { width: SPLASH_LOGO_SIZE, height: SPLASH_LOGO_SIZE },
});
