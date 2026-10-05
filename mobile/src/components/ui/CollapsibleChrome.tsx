import Ionicons from "@expo/vector-icons/Ionicons";
import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { ThemedText } from "@/components/themed-text";
import { Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { hexAlpha } from "@/lib/color";
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
          style={[
            styles.toggle,
            open
              ? {
                  backgroundColor: theme.muted,
                  borderColor: theme.border,
                }
              : {
                  backgroundColor: hexAlpha(theme.primary, 0.14),
                  borderColor: theme.primary,
                },
          ]}
        >
          <View
            style={[
              styles.iconWell,
              {
                backgroundColor: open
                  ? theme.border
                  : hexAlpha(theme.primary, 0.22),
              },
            ]}
          >
            <Ionicons
              name="funnel-outline"
              size={16}
              color={open ? theme.mutedForeground : theme.primary}
            />
          </View>
          <View style={styles.copy}>
            <ThemedText
              type="smallBold"
              style={!open ? { color: theme.primary } : undefined}
            >
              {label}
            </ThemedText>
            {!open && hint ? (
              <ThemedText
                type="small"
                themeColor="mutedForeground"
                numberOfLines={1}
              >
                {hint}
              </ThemedText>
            ) : null}
          </View>
          <Ionicons
            name={open ? "chevron-up" : "chevron-down"}
            size={18}
            color={!open ? theme.primary : theme.mutedForeground}
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
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: Radius.xl,
    borderWidth: 1,
  },
  iconWell: {
    width: 32,
    height: 32,
    borderRadius: Radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: { flex: 1, gap: 2 },
  body: { gap: Spacing.two },
});
