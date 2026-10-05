import { Pressable, Text, type StyleProp, type ViewStyle } from "react-native";

import { resolveChipStyle } from "@/domain/ui/variants/chip";
import { useOptionalThemeScheme } from "@/hooks/use-theme-preference";

/** `Chip` com toque longo (reordenar, editar); o visual vem do mesmo resolvedor. */
export function ChoiceChip({
  label,
  active,
  onPress,
  onLongPress,
  delayLongPress,
  style,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  delayLongPress?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const s = resolveChipStyle({ selected: active }, useOptionalThemeScheme());
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      hitSlop={s.hitSlop}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={delayLongPress}
      style={({ pressed }) => [s.container, pressed && { opacity: 0.8 }, style]}
    >
      <Text style={s.label} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}
