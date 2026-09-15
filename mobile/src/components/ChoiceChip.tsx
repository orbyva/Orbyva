import {
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Radius } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { choiceChipColors } from "@/lib/color";

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
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={delayLongPress}
      style={[styles.chip, choiceChipColors(theme, active), style]}
    >
      <ThemedText
        type="smallBold"
        style={active ? { color: theme.primary } : undefined}
      >
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: Radius.chip,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
});
