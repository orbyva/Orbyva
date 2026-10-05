import Ionicons from "@expo/vector-icons/Ionicons";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import {
  resolveButtonStyle,
  type ButtonSize,
  type ButtonVariant,
} from "@/domain/ui/variants/button";
import { useOptionalThemeScheme } from "@/hooks/use-theme-preference";
import { hapticLight } from "@/lib/haptics";

type IconName = keyof typeof Ionicons.glyphMap;

export type ButtonProps = {
  label?: string;
  children?: ReactNode;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  leftIcon?: IconName;
  rightIcon?: IconName;
  /** Ícone sozinho (com `size="icon"`); exige `accessibilityLabel`. */
  icon?: IconName;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

export function Button({
  label,
  children,
  onPress,
  variant = "default",
  size = "default",
  disabled = false,
  loading = false,
  leftIcon,
  rightIcon,
  icon,
  accessibilityLabel,
  style,
}: ButtonProps) {
  const scheme = useOptionalThemeScheme();
  const idle = resolveButtonStyle({ variant, size, disabled }, scheme);
  const iconSize = size === "sm" ? 14 : 16;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      hitSlop={idle.hitSlop}
      onPress={() => {
        if (variant === "default" || variant === "destructive") void hapticLight();
        onPress?.();
      }}
      style={({ pressed }) => [
        resolveButtonStyle({ variant, size, disabled, pressed }, scheme).container,
        style,
      ]}
    >
      {({ pressed }) => {
        const s = resolveButtonStyle({ variant, size, disabled, pressed }, scheme);
        const content = (
          <View style={[styles.row, loading && styles.hidden]}>
            {leftIcon ? <Ionicons name={leftIcon} size={iconSize} color={s.label.color} /> : null}
            {icon ? <Ionicons name={icon} size={18} color={s.label.color} /> : null}
            {label ? (
              <Text style={s.label} numberOfLines={1}>
                {label}
              </Text>
            ) : null}
            {children}
            {rightIcon ? (
              <Ionicons name={rightIcon} size={iconSize} color={s.label.color} />
            ) : null}
          </View>
        );
        return (
          <>
            {content}
            {loading ? (
              <ActivityIndicator style={StyleSheet.absoluteFill} color={s.label.color} />
            ) : null}
          </>
        );
      }}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  hidden: { opacity: 0 },
});
