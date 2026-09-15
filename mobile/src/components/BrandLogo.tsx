import { Image, StyleSheet, View } from "react-native";

import { BRAND } from "@/lib/brand";

export function BrandLogo({ size = 40 }: { size?: number }) {
  return (
    <View
      style={[
        styles.wrap,
        { width: size, height: size, borderRadius: Math.round(size * 0.28) },
      ]}
    >
      <Image
        accessibilityLabel={BRAND.name}
        source={require("../../assets/images/logo-mark.webp")}
        style={{ width: size, height: size }}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
});
