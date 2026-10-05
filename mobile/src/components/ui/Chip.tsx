import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, Text, type StyleProp, type ViewStyle } from "react-native";

import { resolveChipStyle } from "@/domain/ui/variants/chip";
import { useOptionalThemeScheme } from "@/hooks/use-theme-preference";
import { hapticLight } from "@/lib/haptics";

export function Chip({
  label,
  selected = false,
  onPress,
  tint,
  icon,
  accessibilityLabel,
  style,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** Cor de módulo (`useModuleColors()`); sem ela o selecionado usa `primary`. */
  tint?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const s = resolveChipStyle({ selected, tint }, useOptionalThemeScheme());
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      hitSlop={s.hitSlop}
      onPress={() => {
        void hapticLight();
        onPress?.();
      }}
      style={({ pressed }) => [s.container, pressed && { opacity: 0.8 }, style]}
    >
      {icon ? <Ionicons name={icon} size={14} color={s.label.color} /> : null}
      <Text style={s.label} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}
