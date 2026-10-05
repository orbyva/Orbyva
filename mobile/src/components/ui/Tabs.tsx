import { Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { resolveTabsStyle } from "@/domain/ui/variants/tabs";
import { useOptionalThemeScheme } from "@/hooks/use-theme-preference";
import { hapticLight } from "@/lib/haptics";

/** Segmento controlado no papel do `Tabs` do web (Lista/Projeção, status de conteúdo…). */
export function Tabs<T extends string>({
  items,
  value,
  onValueChange,
  style,
}: {
  items: { value: T; label: string }[];
  value: T;
  onValueChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const s = resolveTabsStyle(useOptionalThemeScheme());
  return (
    <View accessibilityRole="tablist" style={[s.track, style]}>
      {items.map((item) => {
        const active = item.value === value;
        return (
          <Pressable
            key={item.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (active) return;
              void hapticLight();
              onValueChange(item.value);
            }}
            style={[s.tab, active && s.tabActive]}
          >
            <Text style={active ? s.labelActive : s.label} numberOfLines={1}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
