import Ionicons from "@expo/vector-icons/Ionicons";
import { Text, View, type StyleProp, type ViewStyle } from "react-native";

import { resolveBadgeStyle, type BadgeVariant } from "@/domain/ui/variants/badge";
import { useOptionalThemeScheme } from "@/hooks/use-theme-preference";

export function Badge({
  label,
  variant = "default",
  icon,
  style,
}: {
  label: string;
  variant?: BadgeVariant;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
}) {
  const s = resolveBadgeStyle(variant, useOptionalThemeScheme());
  return (
    <View style={[s.container, style]}>
      {icon ? <Ionicons name={icon} size={11} color={s.label.color} /> : null}
      <Text style={s.label} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}
