import { Pressable, StyleSheet, Switch, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { Radius, Spacing } from "@/constants/theme";
import { TypeScale } from "@/domain/ui/typography";
import { useTheme } from "@/hooks/use-theme";
import { hapticLight } from "@/lib/haptics";

/** Liga/desliga com `Switch` nativo — o padrão de celular para o checkbox do web. */
export function ToggleRow({
  title,
  description,
  value,
  onValueChange,
  disabled,
  style,
}: {
  title: string;
  description?: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const toggle = (next: boolean) => {
    void hapticLight();
    onValueChange(next);
  };
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => toggle(!value)}
      style={[styles.row, { borderColor: theme.border, opacity: disabled ? 0.5 : 1 }, style]}
    >
      <View style={styles.copy}>
        <Text style={[TypeScale.bodyStrong, { color: theme.foreground }]}>{title}</Text>
        {description ? (
          <Text style={[TypeScale.caption, { color: theme.mutedForeground }]}>{description}</Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={toggle}
        disabled={disabled}
        trackColor={{ false: theme.input, true: theme.primary }}
        ios_backgroundColor={theme.input}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.three,
    paddingVertical: 12,
  },
  copy: { flex: 1, gap: 2 },
});
