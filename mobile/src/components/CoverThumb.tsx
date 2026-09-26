import { Image, StyleSheet, View } from "react-native";

import { Radius } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { ThemedText } from "@/components/themed-text";

export function CoverThumb({
  uri,
  fallback,
  variant = "poster",
}: {
  uri?: string | null;
  fallback: string;
  variant?: "poster" | "square" | "hero" | "list";
}) {
  const theme = useTheme();
  const size =
    variant === "square"
      ? styles.square
      : variant === "hero"
        ? styles.hero
        : variant === "list"
          ? styles.list
          : styles.poster;
  if (uri) {
    return <Image source={{ uri }} style={[styles.base, size]} />;
  }
  return (
    <View
      style={[styles.base, size, { backgroundColor: theme.backgroundElement }]}
    >
      <ThemedText type="smallBold">{fallback.slice(0, 1).toUpperCase()}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.control,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  poster: { width: 48, height: 72 },
  list: { width: 88, height: 132 },
  square: { width: 88, height: 88 },
  hero: { width: 96, height: 144 },
});
