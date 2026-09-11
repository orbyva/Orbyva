import Ionicons from "@expo/vector-icons/Ionicons";
import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { hapticLight } from "@/lib/haptics";

export function CollapsibleChrome({
  leading,
  label = "Filtros",
  hint,
  defaultOpen = false,
  footer,
  children,
}: {
  leading?: ReactNode;
  label?: string;
  hint?: string;
  defaultOpen?: boolean;
  footer?: ReactNode;
  children?: ReactNode;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(defaultOpen);

  const hasBody = children != null && children !== false;

  return (
    <View style={styles.wrap}>
      {leading}
      {hasBody ? (
        <Pressable
          onPress={() => {
            void hapticLight();
            setOpen((cur) => !cur);
          }}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          style={styles.toggle}
        >
          <View style={styles.copy}>
            <ThemedText type="smallBold">{label}</ThemedText>
            {!open && hint ? (
              <ThemedText
                type="small"
                themeColor="textSecondary"
                numberOfLines={1}
              >
                {hint}
              </ThemedText>
            ) : null}
          </View>
          <Ionicons
            name={open ? "chevron-up" : "chevron-down"}
            size={18}
            color={theme.textSecondary}
          />
        </Pressable>
      ) : null}
      {open && hasBody ? (
        <Animated.View entering={FadeIn.duration(160)} style={styles.body}>
          {children}
        </Animated.View>
      ) : null}
      {footer}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    gap: Spacing.two,
  },
  toggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    paddingVertical: 4,
  },
  copy: { flex: 1, gap: 2 },
  body: { gap: Spacing.two },
});
