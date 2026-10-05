import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";

import { Radius } from "@/constants/theme";
import { useOrbAvatar } from "@/hooks/useOrbAvatar";

const GLOW =
  "0 0 0 1px hsla(266, 78%, 55%, 0.35), 0 6px 18px -6px hsla(266, 78%, 45%, 0.55), 0 0 22px -4px hsla(266, 90%, 60%, 0.45)";

/**
 * A esfera da Orb — par do `OrbSphere` do web. Com versão gerada ativa mostra o PNG dela; sem
 * versão (ou PNG que falha ao carregar) desenha a esfera de `index.css` (`.orb-sphere`) em SVG:
 * corpo em gradiente radial, redemoinho girando devagar e reflexo fixo por cima.
 */
export function OrbSphere({ size = 40 }: { size?: number }) {
  const { url } = useOrbAvatar();
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = Boolean(url) && url !== failedUrl;

  return (
    <View
      style={[styles.glow, { width: size, height: size, boxShadow: GLOW }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={styles.clip}>
        {showImage ? (
          <Image
            source={{ uri: url as string }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            onError={() => setFailedUrl(url)}
          />
        ) : (
          <DrawnSphere size={size} />
        )}
      </View>
    </View>
  );
}

function DrawnSphere({ size }: { size: number }) {
  const reduceMotion = useReducedMotion();
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    rotation.value = withRepeat(
      withTiming(360, { duration: 14000, easing: Easing.linear }),
      -1,
      false
    );
    return () => cancelAnimation(rotation);
  }, [reduceMotion, rotation]);

  const drift = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));
  const swirl = size * 1.6;

  return (
    <>
      <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="orbBody" cx="32" cy="28" r="99" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="hsl(266, 90%, 78%)" />
            <Stop offset="0.38" stopColor="hsl(266, 78%, 55%)" />
            <Stop offset="0.72" stopColor="hsl(239, 84%, 38%)" />
            <Stop offset="1" stopColor="hsl(239, 84%, 22%)" />
          </RadialGradient>
        </Defs>
        <Circle cx="50" cy="50" r="50" fill="url(#orbBody)" />
      </Svg>

      <Animated.View
        style={[
          { position: "absolute", width: swirl, height: swirl, left: -size * 0.3, top: -size * 0.3 },
          drift,
        ]}
      >
        <Svg width={swirl} height={swirl} viewBox="0 0 100 100">
          <Defs>
            <RadialGradient id="orbCyan" cx="71" cy="42" r="40" gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor="hsl(199, 89%, 62%)" stopOpacity="0.55" />
              <Stop offset="1" stopColor="hsl(199, 89%, 62%)" stopOpacity="0" />
            </RadialGradient>
            <RadialGradient id="orbMagenta" cx="31" cy="61" r="40" gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor="hsl(310, 90%, 70%)" stopOpacity="0.45" />
              <Stop offset="1" stopColor="hsl(310, 90%, 70%)" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx="71" cy="42" r="40" fill="url(#orbCyan)" />
          <Circle cx="31" cy="61" r="40" fill="url(#orbMagenta)" />
        </Svg>
      </Animated.View>

      <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="orbShine" cx="30" cy="24" r="103" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="hsl(0, 0%, 100%)" stopOpacity="0.85" />
            <Stop offset="0.22" stopColor="hsl(0, 0%, 100%)" stopOpacity="0.12" />
            <Stop offset="0.45" stopColor="hsl(0, 0%, 100%)" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="orbRim" cx="70" cy="82" r="108" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="hsl(199, 89%, 70%)" stopOpacity="0.35" />
            <Stop offset="0.55" stopColor="hsl(199, 89%, 70%)" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Circle cx="50" cy="50" r="50" fill="url(#orbRim)" />
        <Circle cx="50" cy="50" r="50" fill="url(#orbShine)" />
      </Svg>
    </>
  );
}

const styles = StyleSheet.create({
  glow: { borderRadius: Radius.full },
  clip: { flex: 1, borderRadius: Radius.full, overflow: "hidden" },
});
